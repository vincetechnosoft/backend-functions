import { claimType, fieldValue, fs, obj } from "../utils";

export default {
  create({
    batch,
    claims,
    phoneNumber,
    res,
  }: {
    batch: FirebaseFirestore.WriteBatch;
    res: boolean;
    phoneNumber: string;
    claims: obj;
  }) {
    const cT = claimType.distributor + "-";
    const distributorClaims = Object.entries(claims)
      .filter(([k]) => k.startsWith(cT))
      .map(([k, v]) => [k.substring(cT.length), v]);
    for (const [compneyID, role] of distributorClaims) {
      if (role === 0) {
        batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), {
          [`owners.${phoneNumber}.status`]: res ? 1 : -1,
          updatedFromLisner: fieldValue.increment(1),
        });
      } else if (role === 1) {
        batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), {
          [`workers.${phoneNumber}.status`]: res ? 1 : -1,
          updatedFromLisner: fieldValue.increment(1),
        });
      }
    }
  },
  delete({
    batch,
    claims,
    phoneNumber,
  }: {
    batch: FirebaseFirestore.WriteBatch;
    phoneNumber: string;
    claims: any;
  }) {
    const cT = claimType.distributor + "-";
    const distributorClaims = Object.entries(claims)
      .filter(([k]) => k.startsWith(cT))
      .map(([k, v]) => [k.substring(cT.length), v]);
    for (const [compneyID, role] of distributorClaims) {
      if (role === 0) {
        batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), {
          [`owners.${phoneNumber}`]: fieldValue.delete(),
          updatedFromLisner: fieldValue.increment(1),
        });
      } else if (role === 1) {
        batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), {
          [`workers.${phoneNumber}`]: fieldValue.delete(),
          updatedFromLisner: fieldValue.increment(1),
        });
      }
    }
  },
};
