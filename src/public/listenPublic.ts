import { Change, EventContext } from "firebase-functions/v1";
import { QueryDocumentSnapshot } from "firebase-functions/v1/firestore";
import { sizeIsAbove } from "../utils";

export default async function PUBLIClistenPublic(
  change: Change<QueryDocumentSnapshot>,
  context: EventContext
) {
  const data = change.after.data()!;

  if (await sizeIsAbove(data, 819200)) {
    //! data > 80% of 1mb
    let lastPageNumber = data["lastPageNumber"];
    if (typeof lastPageNumber !== "number") lastPageNumber = 0;
    const newPageNumber = lastPageNumber + 1;
    const isDone = await change.after.ref
      .collection("ARCHIVE")
      .doc(newPageNumber)
      .create(data);
    if (!isDone) return;
    await change.after.ref.set({ lastPageNumber: newPageNumber });
  }
}
