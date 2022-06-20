import { EventContext } from "firebase-functions/v1";
import { getExpireAtInformation } from "../configData";
import { collName, fs } from "../setup";
import { formatedDate, fromDate } from "../utils";

export default async function dailyRun(_: EventContext) {
  const currentDate = formatedDate(fromDate({ day: -1 })).substring(0, 10);
  const currentMonth = "-" + currentDate.substring(0, 7);
  const data = await getExpireAtInformation();
  const tasks: Promise<null>[] = [];
  for (const id in data) {
    if (Object.prototype.hasOwnProperty.call(data, id)) {
      // new > old
      const val = data[id];
      if (val === "**") continue;
      if (val.startsWith("-")) {
        if (val.length !== 8) continue;
        // ! isArchived compney
        if (currentMonth > val) {
          const [type, compneyID] = id.split("-", 2);
          const coll = collName(type);
          if (coll === null) continue;
          tasks.push(
            fs
              .collection(coll)
              .doc(compneyID)
              .delete()
              .then(
                () => null,
                () => null
              )
          );
        }
      } else {
        if (val.length !== 10) continue;
        if (currentDate > val) {
          const [type, compneyID] = id.split("-", 2);
          const coll = collName(type);
          if (coll === null) continue;
          tasks.push(
            fs
              .collection(coll)
              .doc(compneyID)
              .update({ "action.disabled": true })
              .then(
                () => null,
                () => null
              )
          );
        }
      }
    }
  }
}
