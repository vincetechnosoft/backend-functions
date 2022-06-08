import * as admin from "firebase-admin";
import { database, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { Change } from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";

const app = admin.initializeApp();

export const db = app.database();
export const auth = app.auth();
export const fs = app.firestore();
export const bucket = app.storage().bucket();
export const apkBucket = app.storage().bucket("vincetechnosoft-applications");
export const fieldValue = firestore.FieldValue;
export const fieldPath = firestore.FieldPath;

export function log(obj: any) {
  return db
    .ref(`logs/${timeStamp()}`)
    .set(obj)
    .then(
      () => null,
      () => null
    );
}

export function now() {
  const date = new Date();
  date.setHours(date.getHours() + 5);
  date.setMinutes(date.getMinutes() + 30);
  return date;
}

export function fromNow(duration: { day?: number; hr?: number; min?: number }) {
  const date = now();
  if (duration.day) date.setDate(date.getDate() + duration.day);
  if (duration.hr) date.setHours(date.getHours() + duration.hr);
  if (duration.min) date.setMinutes(date.getMinutes() + duration.min);
  return date;
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

export const indianFn = functions.region("asia-south1");
export function validatePhoneForE164(phoneNumber: string) {
  return /^\+[1-9]\d{10,14}$/.test(phoneNumber);
}

export function onError(err: any) {
  functions.logger.error(err);
  return null;
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

export const claimType = {
  distributor: "D",
};

export interface obj<T = any> {
  [key: string]: T;
}
export function getObject<T = any>(
  changes: Change<DocumentSnapshot>,
  path: string
): [obj<T>, obj<T>] {
  let oldObj = changes.before.get(path);
  if (typeof oldObj !== "object" || oldObj === null) oldObj = {};
  let newObj = changes.after.get(path);
  if (typeof newObj !== "object" || newObj === null) newObj = {};
  return [oldObj, newObj];
}

export function getArray<T = any>(
  changes: Change<DocumentSnapshot>,
  path: string
): [T[], T[]] {
  let oldObj = changes.before.get(path);
  if (!Array.isArray(oldObj)) oldObj = [];
  let newObj = changes.after.get(path);
  if (!Array.isArray(newObj)) newObj = [];
  return [oldObj, newObj];
}
