import { EventContext } from "firebase-functions/v1";
import { UserRecord } from "firebase-functions/v1/auth";
import {
  auth,
  db,
  fieldValue,
  fs,
  bucket,
  timeStamp,
  claimType,
} from "../utils";

export default {
  async create(user: UserRecord, _: EventContext) {
    const phoneNumber = user.phoneNumber;
    if (!phoneNumber) return;
    const ref = db.ref("pendingClaimsOfPhoneNumber").child(phoneNumber);
    const claims = (await (await ref.get().catch(() => null))?.val()) ?? null;
    await ref.remove().catch(() => null);
    if (claims) {
      const res = await auth.setCustomUserClaims(user.uid, claims).then(
        () => true,
        () => false
      );
      const batch = fs.batch();
      const distributorClaims = claims[claimType.distributor];
      if (distributorClaims) {
        for (const compneyID in distributorClaims) {
          if (
            Object.prototype.hasOwnProperty.call(distributorClaims, compneyID)
          ) {
            const role = distributorClaims[compneyID];
            if (role === 0) {
              batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), {
                "owner.status": res ? 1 : -1,
                updatedFromLisner: fieldValue.increment(1),
              });
            } else if (role === 1) {
              batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), {
                [`workers.${phoneNumber}.status`]: res ? 1 : -1,
                updatedFromLisner: fieldValue.increment(1),
              });
            }
          }
        }
      }
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
    const distributorClaims = claims[claimType.distributor];
    if (distributorClaims) {
      for (const compneyID in distributorClaims) {
        if (
          Object.prototype.hasOwnProperty.call(distributorClaims, compneyID)
        ) {
          const role = distributorClaims[compneyID];
          if (role === 0) {
            batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), {
              "owner.phoneNumber": null,
              "owner.status": fieldValue.delete(),
              updatedFromLisner: fieldValue.increment(1),
            });
          } else if (role === 1) {
            batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), {
              [`workers.${phoneNumber}`]: fieldValue.delete(),
            });
          }
        }
      }
    }
    batch.delete(fs.doc(`USERS/${user.uid}`));
    await batch.commit();
    await bucket.deleteFiles({ prefix: `USERS-REPORTS/${user.uid}` });
  },
};
