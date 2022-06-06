import { Change, EventContext } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { fieldValue, fs, getUser } from "../utils";

export default async function DISTRIBUTORlistenUser(
  changes: Change<DocumentSnapshot>,
  context: EventContext
) {
  if (
    changes.after.get("updatedFromLisner") !==
    changes.before.get("updatedFromLisner")
  ) {
    return;
  }
  const uid = context.params.uid;
  const user = await getUser({ uid });
  const phoneNumber = user.phoneNumber!;

  let wereDistributor = changes.before.get("distributor");
  if (typeof wereDistributor !== "object" || wereDistributor === null)
    wereDistributor = {};
  let areDistributor = changes.after.get("distributor");
  if (typeof areDistributor !== "object" || areDistributor === null)
    areDistributor = {};

  const tasks: Promise<any>[] = [];

  for (const compneyID in areDistributor) {
    if (
      Object.prototype.hasOwnProperty.call(areDistributor, compneyID) &&
      Object.prototype.hasOwnProperty.call(wereDistributor, compneyID)
    ) {
      const wereMessages: string[] = wereDistributor[compneyID].m;
      const areMessages: string[] = areDistributor[compneyID].m;
      if (areMessages.length > wereMessages.length) {
        const entries: string[] = [];
        let boxReturned = 0;
        for (let i = wereMessages.length; i < areMessages.length; i++) {
          const [type, val]: ["entry" | "reset" | "delete", string] =
            JSON.parse(areMessages[i]);
          if (type === "entry" && val.includes('"-eT":"returnBoxes"')) {
            entries.push(val);
            boxReturned += JSON.parse(val).b;
          }
        }
        tasks.push(
          fs.doc(`DISTRIBUTOR/${compneyID}/DATA/STATE`).update({
            entries: fieldValue.arrayUnion(...entries),
            [`sellOutDue.${phoneNumber}.b`]: fieldValue.increment(-boxReturned),
            boxes: fieldValue.increment(boxReturned),
            updatedFromLisner: fieldValue.increment(1),
          })
        );
      }
    }
  }

  await Promise.all(tasks);
}
