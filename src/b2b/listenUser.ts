import { Change, EventContext } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { fieldValue, fs, getUser } from "../utils";

export default async function listenB2BUser(
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

  let wereB2b = changes.before.get("b2b");
  if (typeof wereB2b !== "object" || wereB2b === null) wereB2b = {};
  let areB2b = changes.after.get("b2b");
  if (typeof areB2b !== "object" || areB2b === null) areB2b = {};

  const tasks: Promise<any>[] = [];

  for (const compneyID in areB2b) {
    if (
      Object.prototype.hasOwnProperty.call(areB2b, compneyID) &&
      Object.prototype.hasOwnProperty.call(wereB2b, compneyID)
    ) {
      const wereMessages: string[] = wereB2b[compneyID].m;
      const areMessages: string[] = areB2b[compneyID].m;
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
          fs.doc(`B2B/${compneyID}/DATA/STATE`).update({
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
