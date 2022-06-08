import { EventContext } from "firebase-functions/v1";
import { UserRecord } from "firebase-functions/v1/auth";
import { db, fs, bucket, timeStamp, setUserClaims } from "../utils";
import DISTRIBUTORonUser from "../DISTRIBUTOR/onUser";

export default {
  async create(user: UserRecord, _: EventContext) {
    const phoneNumber = user.phoneNumber;
    if (!phoneNumber) return;
    const ref = db.ref("pendingClaimsOfPhoneNumber").child(phoneNumber);
    const claims = (await ref.get().catch(() => null))?.val() ?? null;
    await ref.remove().catch(() => null);
    if (claims) {
      const res = await setUserClaims(user.uid, claims).then(
        () => true,
        () => false
      );
      const batch = fs.batch();

      DISTRIBUTORonUser.create({ batch, claims, phoneNumber, res });

      batch.set(
        fs.doc(`USERS/${user.uid}`),
        { createdAt: timeStamp() },
        { merge: true }
      );
      await batch.commit();
    }
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
