import { EventContext } from "firebase-functions/v1";
import { UserRecord } from "firebase-functions/v1/auth";
import { timeStamp } from "../utils";
import { fs, bucket, obj } from "../setup";
import DISTRIBUTORonUser from "../DISTRIBUTOR/onUser";
import { applyPendingClaims, setUserClaims } from "../configData";

export default {
  async create(user: UserRecord, _: EventContext) {
    const phoneNumber = user.phoneNumber;
    if (!phoneNumber) return;
    const [claims, res] = await applyPendingClaims({
      uid: user.uid,
      phoneNumber,
    });

    const setUserDoc: obj = {};
    const batch = fs.batch();

    if (claims) DISTRIBUTORonUser.create({ batch, claims, phoneNumber, res });

    setUserDoc.createdAt = timeStamp();
    await batch
      .set(fs.doc(`USERS/${user.uid}`), setUserClaims, { merge: true })
      .commit();
  },
  async delete(user: UserRecord, _: EventContext) {
    const phoneNumber = user.phoneNumber;
    const claims = user.customClaims;
    if (!phoneNumber || !claims) return;
    const batch = fs.batch();

    DISTRIBUTORonUser.delete({ batch, claims, phoneNumber });

    batch.delete(fs.doc(`USERS/${user.uid}`));
    await batch.commit();
    await bucket.deleteFiles({ prefix: `USERS-REPORTS/${user.uid}` });
  },
};
