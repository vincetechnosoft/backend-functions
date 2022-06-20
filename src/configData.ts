import { database } from "firebase-admin";
import { dateFromTimeStamp, fromDate, getUser, timeStamp } from "./utils";
import { auth, db, obj, claimType } from "./setup";

export function log(obj: any) {
  return db
    .ref(`logs/${timeStamp()}`)
    .set(typeof obj === "object" ? JSON.parse(JSON.stringify(obj)) : obj)
    .then(
      () => null,
      () => null
    );
}
export function debugLog(arg: any) {
  return db
    .ref("debug")
    .child(timeStamp())
    .set(JSON.stringify(arg))
    .then(
      () => null,
      () => null
    );
}
export function handle(handler: (...args: any[]) => any) {
  return async function (...args: any[]) {
    try {
      await handler(...args);
    } catch (err) {
      await db
        .ref("function-log")
        .child(handler.name || "unknown")
        .child(timeStamp())
        .set(JSON.stringify({ args, err }))
        .then(
          () => null,
          () => null
        );
    }
  };
}
export async function setUserClaims(
  uid: string,
  claims: { [key: string]: string } | null
) {
  await auth.setCustomUserClaims(uid, claims);
  await db
    .ref("userClaimsUpdateCounter")
    .child(uid)
    .set(database.ServerValue.increment(1))
    .catch(() => null);
}
export async function setPendingClaims(
  phoneNumber: string,
  node: string,
  value: number | null | ((val: number | null) => number | null)
) {
  phoneNumber = phoneNumber.replace(/ /g, "");
  const ref = db
    .ref("pendingClaimsOfPhoneNumber")
    .child(phoneNumber)
    .child(node);
  if (value === null) return await ref.remove();
  if (typeof value === "number") return await ref.set(value);
  let err;
  await ref.transaction(function (x) {
    try {
      return value(x);
    } catch (e) {
      err = e;
    }
    return undefined;
  });
  throw Error(err);
}

export async function applyPendingClaims({
  phoneNumber,
  uid,
}: {
  phoneNumber: string;
  uid?: string;
}): Promise<[obj, boolean]> {
  phoneNumber = phoneNumber.replace(/ /g, "");
  const ref = db.ref("pendingClaimsOfPhoneNumber").child(phoneNumber);
  const claims = await ref.get().then((x) => x.val());
  if (claims) {
    if (!uid) uid = (await getUser({ phoneNumber })).uid;
    return [
      claims,
      await setUserClaims(uid, claims).then(
        () => true,
        () => false
      ),
    ];
  }
  return [claims, true];
}

export async function applyCompneyExpireDate(
  compneyType: keyof typeof claimType,
  compneyID: string,
  duration: { days: number; months?: number; years?: number } | "free" | "**"
) {
  const ref = db.ref("expiresAt").child(compneyType + "-" + compneyID);
  const data = await ref.get();
  if (duration === "**") return await ref.set("**");
  switch (compneyType) {
    case "distributor":
      if (duration === "free") duration = { days: 21 };
      break;
  }
  const aliveTill = fromDate(
    { day: duration.days, month: duration.months, year: duration.years },
    dateFromTimeStamp(data.val())
  );
  await ref.set(timeStamp(aliveTill).substring(0, 10));
}

export async function removeCompneyExpireDate(
  compneyType: keyof typeof claimType,
  compneyID: string,
  toArchive: boolean
) {
  const ref = db.ref("expiresAt").child(compneyType + "-" + compneyID);
  if (toArchive) {
    await ref.set("-" + timeStamp(fromDate({ month: 10 })).substring(0, 7));
  } else {
    await ref.remove();
  }
}

export function getExpireAtInformation(): Promise<{ [key: string]: string }> {
  return db
    .ref("expiresAt")
    .get()
    .then(
      (x) => x.val() ?? {},
      () => ({})
    );
}
