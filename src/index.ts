import { indianFn } from "./setup";
import { handle } from "./configData";

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
import dailyRun from "./global/runDaily";
import applyCompneyLife from "./global/applyCompneyLife";
import PUBLICcontactUs from "./public/contactUs";
import PUBLICcareers from "./public/careers";
import PUBLIClistenPublic from "./public/listenPublic";

// ! global apis
exports.applyClaimsToPhoneNumber = indianFn.database
  .ref("applyClaimsToPhoneNumber/{phoneNumber}")
  .onWrite(handle(applyClaimsToPhoneNumber));
exports.applyCompneyLife = indianFn.database
  .ref("expiresAt/{id}")
  .onWrite(handle(applyCompneyLife));
exports.onUserCreated = indianFn.auth
  .user()
  .onCreate(handle(onUser.onUserCreate));
exports.onUserDeleted = indianFn.auth
  .user()
  .onDelete(handle(onUser.onUserDelete));
exports.apkChanges = indianFn.storage
  .bucket("vincetechnosoft-applications")
  .object()
  .onFinalize(handle(apkChanges));
exports.listenUserGlobaly = indianFn.firestore
  .document("USERS/{uid}")
  .onUpdate(handle(listenUserGlobaly));
exports.dailyRun = indianFn.pubsub
  .schedule("1 0 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(handle(dailyRun));

// ! PUBLIC apis
exports.PUBLICcontactUs = indianFn.https.onCall(PUBLICcontactUs);
exports.PUBLICcareers = indianFn.https.onCall(PUBLICcareers);
exports.PUBLIClistenPublic = indianFn.firestore
  .document("PUBLIC/{type}")
  .onUpdate(handle(PUBLIClistenPublic));

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
