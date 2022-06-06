import { indianFn, handle } from "./utils";

// ? b2b imports
import monthlyB2BRun from "./b2b/monthlyRun";
import listenB2BCompney from "./b2b/listenCompney";
import listenB2BProducts from "./b2b/listenProducts";
import listenB2BState from "./b2b/listenState";
import listenB2BUser from "./b2b/listenUser";

// ? global imports
import applyClaimsToPhoneNumber from "./global/applyClaimsToPhoneNumber";
import onUser from "./global/onUser";
import apkChanges from "./global/apkChanges";
import listenUserGlobaly from "./global/listenUser";

// ! global apis
exports.applyClaimsToPhoneNumber = indianFn.database
  .ref("applyClaimsToPhoneNumber/{phoneNumber}")
  .onWrite(handle(applyClaimsToPhoneNumber));
exports.onUserCreated = indianFn.auth.user().onCreate(handle(onUser.create));
exports.onUserDeleted = indianFn.auth.user().onDelete(handle(onUser.delete));
exports.apkChanges = indianFn.storage
  .bucket("bmi-apks")
  .object()
  .onFinalize(handle(apkChanges));
exports.listenUserGlobaly = indianFn.firestore
  .document("USERS/{uid}")
  .onUpdate(handle(listenUserGlobaly));

// ! B2B apis
exports.listenB2BCompney = indianFn.firestore
  .document("B2B/{compneyID}")
  .onWrite(handle(listenB2BCompney));
exports.listenB2BProducts = indianFn.firestore
  .document("B2B/{compneyID}/DATA/PRODUCTS")
  .onUpdate(handle(listenB2BProducts));
exports.listenB2BState = indianFn.firestore
  .document("B2B/{compneyID}/DATA/STATE")
  .onWrite(handle(listenB2BState));
exports.monthlyB2BRun = indianFn.pubsub
  .schedule("2 0 1 * *")
  .timeZone("Asia/Kolkata")
  .onRun(handle(monthlyB2BRun));
exports.listenB2BUser = indianFn.firestore
  .document("USERS/{uid}")
  .onUpdate(handle(listenB2BUser));
