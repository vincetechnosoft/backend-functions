import { EventContext } from "firebase-functions/v1";
import { UserRecord } from "firebase-functions/v1/auth";
import { fs, bucket } from "../setup";
import DISTRIBUTORonUser from "../DISTRIBUTOR/onUser";
import { applyPendingClaims } from "../configData";

export default {
  async onUserCreate(user: UserRecord, _: EventContext) {
    const phoneNumber = user.phoneNumber;
    if (!phoneNumber) return;
    const [claims, res] = await applyPendingClaims({
      uid: user.uid,
      phoneNumber,
    });

    await DISTRIBUTORonUser.DISTRIBUTORonUserCreate({
      claims,
      phoneNumber,
      res,
    });
  },
  async onUserDelete(user: UserRecord, _: EventContext) {
    const phoneNumber = user.phoneNumber;
    const claims = user.customClaims;
    if (!phoneNumber || !claims) return;
    const batch = fs.batch();

    await DISTRIBUTORonUser.DISTRIBUTORonUserDelete({
      batch,
      claims,
      phoneNumber,
    });

    batch.delete(fs.doc(`USERS/${user.uid}`));
    await batch.commit();
    await bucket.deleteFiles({ prefix: `USERS-REPORTS/${user.uid}` });
  },
};
