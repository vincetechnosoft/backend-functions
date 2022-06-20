import { Change, EventContext } from "firebase-functions/v1";
import { DataSnapshot } from "firebase-functions/v1/database";
import { collName, fieldValue, fs } from "../setup";

export default async function applyCompneyLife(
  changes: Change<DataSnapshot>,
  context: EventContext
) {
  const id: string = context.params.id;
  const [type, compneyID] = id.split("-", 2);
  const coll = collName(type);
  if (coll === null) return;
  const after = changes.after.val();
  if (typeof after !== "string") {
    const doc = await fs.collection(coll).doc(compneyID).get();
    if (doc.exists) return await changes.after.ref.set(changes.before.val());
  }
  if (after === "**" || after.startsWith("-") || after.length !== 10) return;
  await fs
    .collection(coll)
    .doc(compneyID)
    .update({ "action.disabled": fieldValue.delete() });
}
