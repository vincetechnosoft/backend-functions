import * as admin from "firebase-admin";
import { firestore } from "firebase-admin";
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
export const indianFn = functions.region("asia-south1");

export const claimType = {
  distributor: "D",
};

export function collName(type: string) {
  switch (type as keyof typeof claimType) {
    case "distributor":
      return "DISTRIBUTOR";
    default:
      return null;
  }
}

export function onError(err: any) {
  functions.logger.error(err);
  return null;
}
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
