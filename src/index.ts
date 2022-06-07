import { indianFn, handle } from "./utils";

// ? distributor imports
import DISTRIBUTORmonthlyRun from "./DISTRIBUTOR/monthlyRun";
import DISTRIBUTORlistenCompney from "./DISTRIBUTOR/listenCompney";
import DISTRIBUTORlistenProducts from "./DISTRIBUTOR/listenProducts";
import DISTRIBUTORlistenState from "./DISTRIBUTOR/listenState";

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
  .bucket("vincetechnosoft-applications")
  .object()
  .onFinalize(handle(apkChanges));
exports.listenUserGlobaly = indianFn.firestore
  .document("USERS/{uid}")
  .onUpdate(handle(listenUserGlobaly));

// ! DISTRIBUTOR apis
exports.DISTRIBUTORlistenCompney = indianFn.firestore
  .document("DISTRIBUTOR/{compneyID}")
  .onWrite(handle(DISTRIBUTORlistenCompney));
exports.DISTRIBUTORlistenProducts = indianFn.firestore
  .document("DISTRIBUTOR/{compneyID}/DATA/PRODUCTS")
  .onUpdate(handle(DISTRIBUTORlistenProducts));
exports.DISTRIBUTORlistenState = indianFn.firestore
  .document("DISTRIBUTOR/{compneyID}/DATA/STATE")
  .onWrite(handle(DISTRIBUTORlistenState));
exports.DISTRIBUTORmonthlyRun = indianFn.pubsub
  .schedule("2 0 1 * *")
  .timeZone("Asia/Kolkata")
  .onRun(handle(DISTRIBUTORmonthlyRun));
