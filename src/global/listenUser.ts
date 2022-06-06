import { Change, EventContext, logger } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { bucket } from "../utils";

export default async function listenUserGlobaly(
  changes: Change<DocumentSnapshot>,
  context: EventContext
) {
  const { uid } = context.params;
  const { default: sizeof } = await import("firestore-size");
  const data = changes.after.data()!;

  if (sizeof(data) > 943718) {
    //! data > 90% of 1mb
    let lastPageNumber = data["lastPageNumber"];
    if (typeof lastPageNumber !== "number") lastPageNumber = 0;
    const newPageNumber = lastPageNumber + 1;

    const file = bucket.file(`USER-DATA/${uid}/${newPageNumber}.json`);
    const isDone = await file.save(JSON.stringify(data)).then(
      () => true,
      function (err) {
        logger.error(err);
        return false;
      }
    );

    if (!isDone) return;
    await changes.after.ref.set({ lastPageNumber: newPageNumber });
  }
}
