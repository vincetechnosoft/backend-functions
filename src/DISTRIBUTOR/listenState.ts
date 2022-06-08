import { Change, EventContext } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import { getUser, fieldValue, fs, timeStamp, getArray } from "../utils";

function updateInventory({
  changes,
  updateCurrentDoc,
}: {
  changes: Change<DocumentSnapshot>;
  updateCurrentDoc: { [path: string]: any };
}) {
  const inventory = changes.after.get("inventory");
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
}

function resetCompney({
  changes,
  compneyID,
}: {
  changes: Change<DocumentSnapshot>;
  compneyID: string;
}) {
  return Promise.all(
    Object.entries(changes.before.get("sellOutDue")).map(async function ([
      phoneNumber,
      due,
    ]) {
      try {
        const user = await getUser({ phoneNumber });
        return await fs.doc(`USERS/${user.uid}`).update({
          [`distributor.${compneyID}.m`]: [
            JSON.stringify(["reset", { tS: timeStamp(), dA: due }]),
          ],
          [`distributor.${compneyID}.dA`]: fieldValue.delete(),
          updatedFromLisner: fieldValue.increment(1),
        });
      } catch {
        return null;
      }
    })
  );
}

function updateEntriesInUserDoc({
  changes,
  compneyID,
  tasks,
}: {
  changes: Change<DocumentSnapshot>;
  compneyID: string;
  tasks: Promise<any>[];
}) {
  const [wereEntries, areEntries] = getArray<string>(changes, "entries");

  const messages: {
    [phoneNumber: string]: ["entry" | "entry-deleted", string][];
  } = {};

  for (const removedEntry of wereEntries) {
    if (areEntries.includes(removedEntry)) continue;
    if (
      removedEntry.includes('"-eT":"sell"') ||
      removedEntry.includes('"-eT":"sellOutPayment"') ||
      removedEntry.includes('"-eT":"returnBoxes"')
    ) {
      const i = removedEntry.indexOf('"bN":"+91') + 6;
      const phoneNumber = removedEntry.substring(i, i + 13);
      (messages[phoneNumber] ??= []).push(["entry-deleted", removedEntry]);
    }
  }

  for (const addedEntry of areEntries) {
    if (wereEntries.includes(addedEntry)) continue;
    if (
      addedEntry.includes('"-eT":"sell"') ||
      addedEntry.includes('"-eT":"sellOutPayment"') ||
      addedEntry.includes('"-eT":"returnBoxes"')
    ) {
      const i = addedEntry.indexOf('"bN":"+91') + 6;
      const phoneNumber = addedEntry.substring(i, i + 13);
      (messages[phoneNumber] ??= []).push(["entry", addedEntry]);
    }
  }

  for (const [phoneNumber, message] of Object.entries(messages)) {
    tasks.push(
      getUser({ phoneNumber }).then(async function (user) {
        const ref = fs.doc(`USERS/${user.uid}`);
        const due = changes.after.get(`sellOutDue.${phoneNumber}`);
        try {
          return await ref.update({
            [`distributor.${compneyID}.m`]: fieldValue.arrayUnion(...message),
            [`distributor.${compneyID}.dA`]: due,
            updatedFromLisner: fieldValue.increment(1),
          });
        } catch {
          return await ref.create({
            distributor: {
              [compneyID]: {
                m: [...message],
                dA: due,
              },
            },
          });
        }
      })
    );
  }
}

function deleteCompney({
  changes,
  compneyID,
}: {
  changes: Change<DocumentSnapshot>;
  compneyID: string;
}) {
  return Promise.all(
    Object.entries(changes.before.get("sellOutDue")).map(async function ([
      phoneNumber,
      due,
    ]) {
      try {
        const user = await getUser({ phoneNumber });
        return await fs.doc(`USERS/${user.uid}`).update({
          [`distributor.${compneyID}.m`]: fieldValue.arrayUnion(
            JSON.stringify(["delete", { tS: timeStamp(), dA: due }])
          ),
          [`distributor.${compneyID}.dA`]: fieldValue.delete(),
          updatedFromLisner: fieldValue.increment(1),
        });
      } catch {
        return null;
      }
    })
  );
}

export default async function DISTRIBUTORlistenState(
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
  if (changes.after.exists) {
    const updateCurrentDoc: { [path: string]: any } = {};
    updateInventory({ changes, updateCurrentDoc });

    const tasks: Array<Promise<any>> = [];

    if (changes.after.get("reset") !== changes.before.get("reset")) {
      resetCompney({ changes, compneyID });
    } else {
      updateEntriesInUserDoc({ changes, compneyID, tasks });
    }

    if (Object.keys(updateCurrentDoc).length) {
      updateCurrentDoc["updatedFromLisner"] = fieldValue.increment(1);
      tasks.push(changes.after.ref.update(updateCurrentDoc));
    }

    await Promise.all(tasks);
  } else {
    deleteCompney({ changes, compneyID });
  }
}
