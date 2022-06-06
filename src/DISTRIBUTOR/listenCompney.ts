import { Change, EventContext } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import {
  auth,
  db,
  fieldValue,
  fs,
  onError,
  bucket,
  timeStamp,
  validatePhoneForE164,
  claimType,
} from "../utils";

async function applyClaims(
  phoneNumber: string,
  compneyID: string,
  role: "owner" | "worker" | "disable" | null
): Promise<boolean | null> {
  if (
    typeof phoneNumber !== "string" ||
    !phoneNumber.startsWith("+91") ||
    !validatePhoneForE164(phoneNumber)
  ) {
    // ! can't implement claims on unsupported phone number
    return false;
  }
  const user = await auth.getUserByPhoneNumber(phoneNumber).catch(() => null);
  if (user === null) {
    // ! keep claims in pending state
    const ref = db
      .ref("pendingClaimsOfPhoneNumber")
      .child(phoneNumber)
      .child(`${claimType.distributor}-${compneyID}`);

    if (!role || role == "disable") {
      return await ref.remove().then(
        () => null,
        (e) => onError(e) || false
      );
    }
    return await ref.set(role === "owner" ? 0 : 1).then(
      () => null,
      (e) => onError(e) || false
    );
  }
  // ! apply claim in live
  const customClaims = user.customClaims ?? {};
  const distributorClaims = (customClaims[claimType.distributor] ??= {});
  const currentClaims = distributorClaims[compneyID];
  if (role === null) {
    // ! already have no claims then return #true
    if (currentClaims === undefined) return true;
    delete distributorClaims[compneyID];
  } else if (role === "disable") {
    // ! already is disabled then return #true
    if (currentClaims === -1) return true;
    distributorClaims[compneyID] = -1;
  } else if (role === "owner") {
    // ! already is owner then return #true
    if (currentClaims === 0) return true;
    // ! already have some active claim then return #false
    if (currentClaims !== -1 && currentClaims !== undefined) return false;
    distributorClaims[compneyID] = 0;
  } else {
    // ! already is worker then return #true
    if (currentClaims === 1) return true;
    // ! already have some active claim then return #false
    if (currentClaims !== -1 && currentClaims !== undefined) return false;
    distributorClaims[compneyID] = 1;
  }
  // ! if no info in distributor node if customeClaims then remove node
  if (!Object.keys(distributorClaims).length)
    delete customClaims[claimType.distributor];
  try {
    if (!Object.keys(customClaims).length) {
      // ! if no info in customClaims then remove claims
      await auth.setCustomUserClaims(user.uid, null);
    } else {
      // ! applying claims
      await auth.setCustomUserClaims(user.uid, customClaims);
    }
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}

export default async function DISTRIBUTORlistenCompney(
  changes: Change<DocumentSnapshot>,
  context: EventContext
) {
  if (
    changes.after.exists &&
    changes.before.exists &&
    changes.after.get("updatedFromLisner") !==
      changes.before.get("updatedFromLisner")
  ) {
    // ! if compney doc field "updatedFromLisner" has changed then #ignore
    return;
  }
  const compneyID = context.params.compneyID;
  const tasks: Array<Promise<null>> = [];
  const updateCurrentDoc: { [field: string]: any } = {};
  const commits: {
    [docPath: string]:
      | { data: { [field: string]: any }; type: "update" | "create" | "set" }
      | { type: "delete" };
  } = {};

  const wasDisabled = changes.before.get("action.disabled");
  const isDisabled = changes.after.get("action.disabled");
  const needsReset =
    changes.after.get("action.reset") !== changes.before.get("action.reset");

  const wasOwnerNumber = changes.before.get("owner.phoneNumber");
  const isOwnerNumber = changes.after.get("owner.phoneNumber");

  if (isOwnerNumber !== wasOwnerNumber) {
    if (!isDisabled) {
      // ! apply owner claims to new number
      tasks.push(
        applyClaims(isOwnerNumber, compneyID, "owner").then(function (res) {
          updateCurrentDoc["owner.status"] = res ? 1 : res === false ? -1 : 0;
          return null;
        })
      );
    }
    // ! remove owner claims from old number
    tasks.push(
      applyClaims(wasOwnerNumber, compneyID, null).then((res) => null)
    );
  }

  let wereWorker = changes.before.get("workers");
  if (typeof wereWorker !== "object" || wereWorker === null) wereWorker = {};

  let areWorker = changes.after.get("workers");
  if (typeof areWorker !== "object" || areWorker === null) areWorker = {};

  for (const workerNumber of Object.keys(areWorker)) {
    if (workerNumber in wereWorker) {
      // ! ignore numbers which are not changed
      delete wereWorker[workerNumber];
    } else if (!isDisabled) {
      // ! apply worker claims to numbers which are newly added
      tasks.push(
        applyClaims(workerNumber, compneyID, "worker").then(function (res) {
          updateCurrentDoc[`workers.${workerNumber}.status`] = res
            ? 1
            : res === false
            ? -1
            : 0;
          return null;
        })
      );
    }
  }
  for (const workerNumber of Object.keys(wereWorker)) {
    // ! remove worker claims from numbers which are removed
    tasks.push(applyClaims(workerNumber, compneyID, null).then(() => null));
    if (!needsReset) {
      // ! register ex-worker for old records
      updateCurrentDoc[`ex-workers.${workerNumber}`] = wereWorker[workerNumber];
    }
  }

  if (!changes.before.exists) {
    // ! if compney is created
    updateCurrentDoc["logsInCurrentPage"] = 1;
    updateCurrentDoc["currentLogPageNum"] = 1;
    commits[`DISTRIBUTOR/${compneyID}/LOGS/page-1`] = {
      data: {
        [timeStamp()]: JSON.stringify({
          message: "Enterprise Created",
          chnageType: "company",
        }),
      },
      type: "create",
    };
    commits[`DISTRIBUTOR/${compneyID}/DATA/ORDERS`] = {
      data: {},
      type: "create",
    };
    commits[`DISTRIBUTOR/${compneyID}/DATA/PRODUCTS`] = {
      data: {},
      type: "create",
    };
    commits[`DISTRIBUTOR/${compneyID}/DATA/STATE`] = {
      data: {},
      type: "create",
    };
    commits["CONFIG/DISTRIBUTOR"] = {
      data: {
        [compneyID]: JSON.stringify({
          name: `${changes.after.get("name")}`,
        }),
      },
      type: "update",
    };
  } else if (!changes.after.exists) {
    // ! if compney is deleted
    commits["CONFIG/DISTRIBUTOR"] = {
      data: { [compneyID]: fieldValue.delete() },
      type: "update",
    };
    for (let page = 1; page < changes.before.get("currentLogPageNum"); page++) {
      commits[`DISTRIBUTOR/${compneyID}/LOGS/page-${page}`] = {
        type: "delete",
      };
    }
    commits[`DISTRIBUTOR/${compneyID}/DATA/ORDERS`] = { type: "delete" };
    commits[`DISTRIBUTOR/${compneyID}/DATA/PRODUCTS`] = { type: "delete" };
    commits[`DISTRIBUTOR/${compneyID}/DATA/STATE`] = { type: "delete" };
    tasks.push(
      bucket
        .deleteFiles({ prefix: `DISTRIBUTOR-REPORTS/${compneyID}` })
        .then(() => null, onError)
    );
  } else {
    const oldName = changes.before.get("name");
    const newName = changes.after.get("name");
    const oldReportTill = changes.before.get("reportTill");
    const newReportTill = changes.after.get("reportTill");
    const oldDisabled = changes.before.get("action.disabled");
    const newDisabled = changes.after.get("action.disabled");
    if (
      newName !== oldName ||
      oldReportTill !== newReportTill ||
      oldDisabled !== newDisabled
    ) {
      // ! if compney info changes
      commits["CONFIG/DISTRIBUTOR"] = {
        data: {
          [compneyID]: JSON.stringify({
            name: `${newName}`,
            reportTill: newReportTill,
            disabled: newDisabled ? newDisabled : undefined,
          }),
        },
        type: "update",
      };
    }
    if (needsReset) {
      // ! if reset compney data
      updateCurrentDoc["report"] = fieldValue.delete();
      updateCurrentDoc["ex-workers"] = fieldValue.delete();
      updateCurrentDoc["ex-seller"] = fieldValue.delete();
      updateCurrentDoc["ex-buyers"] = fieldValue.delete();
      commits[`DISTRIBUTOR/${compneyID}/DATA/ORDERS`] = {
        data: {},
        type: "set",
      };
      commits[`DISTRIBUTOR/${compneyID}/DATA/STATE`] = {
        data: {
          inventory: {},
          reset: fieldValue.increment(1),
          sellOutDue: {},
          entries: [],
          buyInDue: {},
          walletMoney: 0,
          boxes: 0,
        },
        type: "update",
      };
      tasks.push(
        bucket
          .deleteFiles({ prefix: `DISTRIBUTOR-REPORTS/${compneyID}` })
          .then(() => null, onError)
      );
    } else {
      let wereSellers = changes.before.get("seller");
      if (typeof wereSellers !== "object" || wereSellers === null)
        wereSellers = {};
      let areSellers = changes.after.get("seller");
      if (typeof areSellers !== "object" || areSellers === null)
        areSellers = {};
      for (const sellerID of Object.keys(wereSellers)) {
        if (sellerID in areSellers) continue;
        // ! register ex-sellers for old records
        updateCurrentDoc[`ex-seller.${sellerID}`] = wereSellers[sellerID];
      }
      let wereBuyers = changes.before.get("buyers");
      if (typeof wereBuyers !== "object" || wereBuyers === null)
        wereBuyers = {};
      let areBuyers = changes.after.get("buyers");
      if (typeof areBuyers !== "object" || areBuyers === null) areBuyers = {};
      for (const buyerNumber of Object.keys(wereBuyers)) {
        if (buyerNumber in areBuyers) continue;
        // ! register ex-buyers for old records
        updateCurrentDoc[`ex-buyer.${buyerNumber}`] = wereBuyers[buyerNumber];
      }
    }
    if (!wasDisabled && isDisabled) {
      // ! now became disabled
      tasks.push(
        applyClaims(isOwnerNumber, compneyID, "disable").then(
          () => null,
          onError
        )
      );
      if (typeof areWorker !== "object" || areWorker === null) areWorker = {};
      for (const workerNumber of Object.keys(areWorker)) {
        tasks.push(
          applyClaims(workerNumber, compneyID, "disable").then(
            () => null,
            onError
          )
        );
      }
    } else if (wasDisabled && !isDisabled) {
      // ! now became enabled
      tasks.push(
        applyClaims(isOwnerNumber, compneyID, "owner").then(function (res) {
          updateCurrentDoc["owner.status"] = res ? 1 : res === false ? -1 : 0;
          return null;
        }, onError)
      );
      if (typeof areWorker !== "object" || areWorker === null) areWorker = {};
      for (const workerNumber of Object.keys(areWorker)) {
        tasks.push(
          applyClaims(workerNumber, compneyID, "worker").then(function (res) {
            updateCurrentDoc[`workers.${workerNumber}.status`] = res
              ? 1
              : res === false
              ? -1
              : 0;
            return null;
          }, onError)
        );
      }
    }
  }

  // ! wait for all async task to be completed
  await Promise.all(tasks).catch(onError);

  if (Object.keys(commits).length) {
    // ! run a batch of commits on docs
    const batch = fs.batch();
    if (Object.keys(updateCurrentDoc).length && changes.after.exists) {
      // ! if compney doc is updated from fn change "updatedFromLisner"
      updateCurrentDoc["updatedFromLisner"] = fieldValue.increment(1);
      batch.update(fs.doc(`DISTRIBUTOR/${compneyID}`), updateCurrentDoc);
    }
    for (const docPath in commits) {
      if (Object.prototype.hasOwnProperty.call(commits, docPath)) {
        const query = commits[docPath];
        switch (query.type) {
          case "create":
            batch.create(fs.doc(docPath), query.data);
            break;
          case "delete":
            batch.delete(fs.doc(docPath));
            break;
          case "update":
            batch.update(fs.doc(docPath), query.data);
            break;
          case "set":
            batch.set(fs.doc(docPath), query.data);
            break;
        }
      }
    }
    await batch
      .commit()
      .then(() => null)
      .catch(onError);
  } else if (Object.keys(updateCurrentDoc).length && changes.after.exists) {
    // ! if compney doc is updated from fn change "updatedFromLisner"
    updateCurrentDoc["updatedFromLisner"] = fieldValue.increment(1);
    await fs
      .doc(`DISTRIBUTOR/${compneyID}`)
      .update(updateCurrentDoc)
      .then(() => null)
      .catch(onError);
  }
}
