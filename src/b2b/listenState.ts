import { Change, EventContext } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { getUser, fieldValue, fs, timeStamp } from "../utils";

export default async function listenB2BState(
  changes: Change<DocumentSnapshot>,
  context: EventContext
) {
  if (
    changes.after.exists &&
    changes.before.exists &&
    changes.after.get("updatedFromLisner") !==
      changes.before.get("updatedFromLisner")
  ) {
    return;
  }
  const compneyID = context.params.compneyID;
  const inventory = changes.after.get("inventory");
  if (changes.after.exists) {
    const updateCurrentDoc: { [path: string]: any } = {};
    for (const itemID in inventory) {
      if (Object.prototype.hasOwnProperty.call(inventory, itemID)) {
        const quntity = inventory[itemID];
        const pIB = changes.after.get(`pIB.${itemID}`);
        if (pIB) {
          let q = Math.floor(quntity.p / pIB);
          if (q == 0) continue;
          updateCurrentDoc[`inventory.${itemID}.q`] = fieldValue.increment(
            q * 1000
          );
          updateCurrentDoc[`inventory.${itemID}.p`] = fieldValue.increment(
            -q * pIB
          );
        }
      }
    }

    let wereEntries: Array<string> = changes.before.get("entries");
    if (!Array.isArray(wereEntries)) wereEntries = [];

    let areEntries: Array<string> = changes.after.get("entries");
    if (!Array.isArray(areEntries)) areEntries = [];

    const addEntries: { [phoneNumber: string]: string[] } = {};
    const removeEntries: { [phoneNumber: string]: string[] } = {};
    if (changes.after.get("reset") !== changes.before.get("reset")) {
      await Promise.all(
        Object.entries(changes.before.get("sellOutDue")).map(async function ([
          phoneNumber,
          due,
        ]) {
          try {
            const user = await getUser({ phoneNumber });
            return await fs.doc(`USERS/${user.uid}`).update({
              [`b2b.${compneyID}.m`]: fieldValue.arrayUnion(
                JSON.stringify(["reset", { tS: timeStamp(), dA: due }])
              ),
              [`b2b.${compneyID}.dA`]: fieldValue.delete(),
              updatedFromLisner: fieldValue.increment(1),
            });
          } catch {
            return null;
          }
        })
      );
    } else if (wereEntries.length > areEntries.length) {
      for (const removedEntry of wereEntries) {
        if (areEntries.includes(removedEntry)) continue;
        if (
          removedEntry.includes('"-eT":"sell"') ||
          removedEntry.includes('"-eT":"sellOutPayment"') ||
          removedEntry.includes('"-eT":"returnBoxes"')
        ) {
          const i = removedEntry.indexOf('"bN":"+91') + 6;
          const phoneNumber = removedEntry.substring(i, i + 13);
          (removeEntries[phoneNumber] ??= []).push(removedEntry);
        }
      }
    } else if (wereEntries.length < areEntries.length) {
      for (const addedEntry of areEntries) {
        if (wereEntries.includes(addedEntry)) continue;
        if (
          addedEntry.includes('"-eT":"sell"') ||
          addedEntry.includes('"-eT":"sellOutPayment"') ||
          addedEntry.includes('"-eT":"returnBoxes"')
        ) {
          const i = addedEntry.indexOf('"bN":"+91') + 6;
          const phoneNumber = addedEntry.substring(i, i + 13);
          (addEntries[phoneNumber] ??= []).push(addedEntry);
        }
      }
    }
    const tasks: Array<Promise<any>> = [];
    for (const [phoneNumber, entries] of Object.entries(addEntries)) {
      tasks.push(
        getUser({ phoneNumber }).then(async function (user) {
          const ref = fs.doc(`USERS/${user.uid}`);
          const due = changes.after.get(`sellOutDue.${phoneNumber}`);
          try {
            return await ref.update({
              [`b2b.${compneyID}.m`]: fieldValue.arrayUnion(
                ...entries.map((e) => JSON.stringify(["entry", e]))
              ),
              [`b2b.${compneyID}.dA`]: due,
              updatedFromLisner: fieldValue.increment(1),
            });
          } catch {
            return await ref.create({
              b2b: {
                [compneyID]: {
                  m: [...entries.map((e) => JSON.stringify(["entry", e]))],
                  dA: due,
                },
              },
            });
          }
        })
      );
    }
    for (const [phoneNumber, entries] of Object.entries(removeEntries)) {
      tasks.push(
        getUser({ phoneNumber }).then(function (user) {
          return fs.doc(`USERS/${user.uid}`).update({
            [`b2b.${compneyID}.m`]: fieldValue.arrayUnion(
              ...entries.map((e) => JSON.stringify(["entry-deleted", e]))
            ),
            [`b2b.${compneyID}.dA`]: changes.after.get(
              `sellOutDue.${phoneNumber}`
            ),
            updatedFromLisner: fieldValue.increment(1),
          });
        })
      );
    }

    if (Object.keys(updateCurrentDoc).length) {
      updateCurrentDoc["updatedFromLisner"] = fieldValue.increment(1);
      tasks.push(changes.after.ref.update(updateCurrentDoc));
    }

    await Promise.all(tasks);
  } else {
    await Promise.all(
      Object.entries(changes.before.get("sellOutDue")).map(async function ([
        phoneNumber,
        due,
      ]) {
        try {
          const user = await getUser({ phoneNumber });
          return await fs.doc(`USERS/${user.uid}`).update({
            [`b2b.${compneyID}.m`]: fieldValue.arrayUnion(
              JSON.stringify(["delete", { tS: timeStamp(), dA: due }])
            ),
            [`b2b.${compneyID}.dA`]: fieldValue.delete(),
            updatedFromLisner: fieldValue.increment(1),
          });
        } catch {
          return null;
        }
      })
    );
  }
}
