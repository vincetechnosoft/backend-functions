import { database } from "firebase-admin";
import { auth, db } from "./setup";

export function now() {
  const date = new Date();
  date.setHours(date.getHours() + 5);
  date.setMinutes(date.getMinutes() + 30);
  return date;
}

export function fromDate(
  duration: {
    day?: number;
    hr?: number;
    min?: number;
    month?: number;
    year?: number;
  },
  date?: Date
) {
  date ??= now();
  if (duration.min) date.setMinutes(date.getMinutes() + duration.min);
  if (duration.hr) date.setHours(date.getHours() + duration.hr);
  if (duration.day) date.setDate(date.getDate() + duration.day);
  if (duration.month) date.setMonth(date.getMonth() + duration.month);
  if (duration.year) date.setFullYear(date.getFullYear() + duration.year);
  return date;
}

export function dateFromTimeStamp(timeStamp: string, orElse?: () => Date) {
  orElse ??= now;
  try {
    if (typeof timeStamp !== "string" || timeStamp.length < 16) return orElse();
    const year = -timeStamp.substring(0, 4);
    const month = -timeStamp.substring(5, 7);
    const date = -timeStamp.substring(8, 10);
    const hr = -timeStamp.substring(11, 13);
    const min = -timeStamp.substring(14, 16);
    return new Date(Date.UTC(-year, -1 - month, -date, -hr, -min));
  } catch {
    return orElse();
  }
}

export function timeStamp(date?: Date) {
  return (date ?? now())
    .toISOString()
    .substring(0, 23)
    .replace("T", " ")
    .replace(".", ":");
}

export function formatedDate(date?: Date) {
  return (date ?? now()).toISOString().substring(0, 10);
}

export function validatePhoneForE164(phoneNumber: string) {
  return /^\+[1-9]\d{10,14}$/.test(phoneNumber);
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

export async function getUser({
  phoneNumber,
  uid,
}: {
  phoneNumber?: string;
  uid?: string;
}) {
  if (uid) return await auth.getUser(uid);
  try {
    return await auth.getUserByPhoneNumber(phoneNumber!);
  } catch {
    return await auth.createUser({ phoneNumber });
  }
}

let _sizeOf: (object: object) => number;
export async function sizeIsAbove(data: any, bytes: number) {
  _sizeOf ??= (await import("firestore-size")).default;
  return _sizeOf(data) > bytes;
}
