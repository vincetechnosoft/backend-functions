import { EventContext, logger } from "firebase-functions/v1";
import { fieldValue, formatedDate, fromNow, fs, bucket } from "../utils";

export default async function monthlyB2BRun(_: EventContext) {
  const currentMonth = formatedDate(fromNow({ day: -1 })).substring(0, 7);
  const b2b = (await fs.doc("CONFIG/B2B").get()).data();
  const tasks: Array<Promise<null>> = [];

  if (typeof b2b === "object" && b2b !== null) {
    for (const compneyID of Object.keys(b2b)) {
      const compneyRef = fs.doc(`B2B/${compneyID}`);
      const stateRef = fs.doc(`B2B/${compneyID}/DATA/STATE`);
      // const ordersRef = fs.doc(`B2B/${compneyID}/DATA/ORDERS`);
      const file = bucket.file(`B2B-REPORTS/${compneyID}/${currentMonth}.json`);
      tasks.push(
        fs.runTransaction(async function (transaction) {
          const [
            stateDoc,
            // ordersDoc
          ] = await transaction.getAll(
            stateRef
            // ordersRef
          );
          const isDone = await file
            .save(
              JSON.stringify({
                // ordersDoc: ordersDoc.data(),
                stateDoc: stateDoc.data(),
                date: currentMonth,
              })
            )
            .then(
              () => true,
              function (err) {
                logger.error(err);
                return false;
              }
            );
          if (isDone)
            transaction
              .update(compneyRef, {
                report: fieldValue.arrayUnion(currentMonth),
                updatedFromLisner: fieldValue.increment(1),
              })
              .update(stateRef, {
                entries: [],
                updatedFromLisner: fieldValue.increment(1),
              });
          // .set(ordersRef, {});
          return null;
        })
      );
    }
  }
  await Promise.all(tasks);
}
