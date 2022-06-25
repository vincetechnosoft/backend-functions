import { Change, EventContext, logger } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { handle } from "../configData";
import DISTRIBUTORlistenUser from "../DISTRIBUTOR/listenUser";
import { bucket } from "../setup";
import { sizeIsAbove } from "../utils";

async function allUserLisiners(
  changes: Change<DocumentSnapshot>,
  context: EventContext
) {
  await Promise.all(
    [DISTRIBUTORlistenUser].map(async function (fn) {
      return handle(fn)(changes, context);
    })
  );
}

export default async function listenUserGlobaly(
  changes: Change<DocumentSnapshot>,
  context: EventContext
) {
  const lisiners = allUserLisiners(changes, context);
  const { uid } = context.params;
  const data = changes.after.data()!;

  if (await sizeIsAbove(data, 943718)) {
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
  await lisiners;
}
