import { Change, EventContext } from "firebase-functions/v1";
import { QueryDocumentSnapshot } from "firebase-functions/v1/firestore";
import { timeStamp } from "../utils";
import { fieldValue, fs } from "../setup";

export default async function DISTRIBUTORlistenProducts(
  changes: Change<QueryDocumentSnapshot>,
  context: EventContext
) {
  const compneyID = context.params.compneyID;
  const oldAvaleble = changes.before.get("avalable") ?? {};
  const newAvaleble = changes.after.get("avalable") ?? {};
  const itemDeleted: Array<string> = [];
  const itemCreated: Array<string> = [];
  for (const itemID of Object.keys(oldAvaleble)) {
    if (!(itemID in newAvaleble)) {
      itemDeleted.push(itemID);
    }
  }
  for (const itemID of Object.keys(newAvaleble)) {
    if (!(itemID in oldAvaleble)) {
      itemCreated.push(itemID);
    }
  }
  if (itemDeleted.length || itemCreated.length) {
    const compneyRef = fs.doc(`DISTRIBUTOR/${compneyID}`);
    const stateRef = compneyRef.collection("DATA").doc("STATE");
    fs.runTransaction(async function (transaction) {
      const stateDocChanges: { [path: string]: any } = {
        updatedFromLisner: fieldValue.increment(1),
      };
      if (itemCreated.length) {
        for (const itemID of itemCreated) {
          const pIB = newAvaleble[itemID].pIB;
          if (pIB) stateDocChanges[`pIB.${itemID}`] = pIB;
        }
      }
      if (itemDeleted.length) {
        const [stateDoc, compenyDoc] = await transaction.getAll(
          stateRef,
          compneyRef
        );
        const log = { chnageType: "itemDeleted", itemInfo: [] as Array<any> };
        for (const itemID of itemDeleted) {
          const fieldPath = `inventory.${itemID}`;
          stateDocChanges[fieldPath] = fieldValue.delete();
          stateDocChanges[`pIB.${itemID}`] = fieldValue.delete();
          log.itemInfo.push({
            ...oldAvaleble[itemID],
            i: stateDoc.get(fieldPath) ?? null,
          });
        }
        const noOfLogs = compenyDoc.get("logsInCurrentPage");
        const logsPage = compenyDoc.get("currentLogPageNum");
        if (noOfLogs >= maxLogs) {
          const logRef = compneyRef
            .collection("LOGS")
            .doc(`page-${logsPage + 1}`);
          transaction = transaction
            .create(logRef, { [timeStamp()]: log })
            .update(compneyRef, {
              logsInCurrentPage: 1,
              currentLogPageNum: fieldValue.increment(1),
              updatedFromLisner: fieldValue.increment(1),
            });
        } else {
          const logRef = compneyRef.collection("LOGS").doc(`page-${logsPage}`);
          transaction = transaction
            .update(logRef, { [timeStamp()]: JSON.stringify(log) })
            .update(compneyRef, {
              logsInCurrentPage: fieldValue.increment(1),
              updatedFromLisner: fieldValue.increment(1),
            });
        }
      }
      transaction.update(stateRef, stateDocChanges);
    });
  }
}

const maxLogs = 100;
