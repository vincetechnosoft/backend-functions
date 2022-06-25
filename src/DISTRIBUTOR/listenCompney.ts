import { Change, EventContext } from "firebase-functions/v1";
import { DocumentSnapshot } from "firebase-functions/v1/firestore";
import {
  applyCompneyExpireDate,
  removeCompneyExpireDate,
  setPendingClaims,
  setUserClaims,
} from "../configData";
import {
  auth,
  fieldValue,
  fs,
  onError,
  bucket,
  claimType,
  obj,
  getObject,
} from "../setup";
import { timeStamp, validatePhoneForE164 } from "../utils";

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
    const node = `${claimType.distributor}-${compneyID}`;
    let promice;
    if (!role) {
      promice = setPendingClaims(phoneNumber, node, null);
    } else if (role == "disable") {
      promice = setPendingClaims(phoneNumber, node, -1);
    } else if (role === "owner") {
      promice = setPendingClaims(phoneNumber, node, 0);
    } else if (role === "worker") {
      promice = setPendingClaims(phoneNumber, node, function (x) {
        if (x === 0) throw Error("owner can't be workers");
        return 1;
      });
    } else return null;
    return await promice.then(
      () => null,
      (e) => onError(e) || false
    );
  }
  // ! apply claim in live
  const customClaims = user.customClaims ?? {};
  const currentClaims = customClaims[`${claimType.distributor}-${compneyID}`];
  if (role === null) {
    // ! already have no claims then return #true
    if (currentClaims === undefined) return true;
    delete customClaims[`${claimType.distributor}-${compneyID}`];
  } else if (role === "disable") {
    // ! already is disabled then return #true
    if (currentClaims === -1) return true;
    customClaims[`${claimType.distributor}-${compneyID}`] = -1;
  } else if (role === "owner") {
    // ! already is owner then return #true
    if (currentClaims === 0) return true;
    // ! already have some active claim then return #false
    if (currentClaims !== -1 && currentClaims !== undefined) return false;
    customClaims[`${claimType.distributor}-${compneyID}`] = 0;
  } else {
    // ! already is worker then return #true
    if (currentClaims === 1) return true;
    // ! already have some active claim then return #false
    if (currentClaims !== -1 && currentClaims !== undefined) return false;
    customClaims[`${claimType.distributor}-${compneyID}`] = 1;
  }
  try {
    await setUserClaims(user.uid, customClaims);
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}

function updateRoles({
  oldNumbers,
  newNumbers,
  compneyID,
  isDisabled,
  needsReset,
  tasks,
  updateCurrentDoc,
  role,
}: {
  newNumbers: obj;
  oldNumbers: obj;
  isDisabled: boolean;
  tasks: Promise<null>[];
  updateCurrentDoc: obj;
  compneyID: string;
  needsReset: boolean;
  role: "owner" | "worker";
}) {
  for (const phoneNumber of Object.keys(newNumbers)) {
    if (phoneNumber in oldNumbers) {
      // ! ignore numbers which are not changed
      delete oldNumbers[phoneNumber];
    } else if (!isDisabled) {
      // ! apply owner claims to numbers which are newly added
      tasks.push(
        applyClaims(phoneNumber, compneyID, role).then(function (res) {
          updateCurrentDoc[`${role}s.${phoneNumber}.status`] = res
            ? 1
            : res === false
            ? -1
            : 0;
          return null;
        })
      );
    }
  }
  for (const phoneNumber of Object.keys(oldNumbers)) {
    // ! remove worker claims from numbers which are removed
    tasks.push(applyClaims(phoneNumber, compneyID, null).then(() => null));
    if (!needsReset) {
      // ! register ex-worker for old records
      updateCurrentDoc[`ex-${role}s.${phoneNumber}`] = oldNumbers[phoneNumber];
    }
  }
}

function initCompney({
  updateCurrentDoc,
  commits,
  compneyID,
  changes,
  tasks,
}: {
  changes: Change<DocumentSnapshot>;
  compneyID: string;
  updateCurrentDoc: obj;
  commits: {
    [docPath: string]:
      | { data: obj; type: "update" | "create" | "set" }
      | { type: "delete" };
  };
  tasks: Promise<null>[];
}) {
  tasks.push(applyCompneyExpireDate("distributor", compneyID, "free").then());
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
}

function deleteCompney({
  commits,
  compneyID,
  changes,
  tasks,
}: {
  changes: Change<DocumentSnapshot>;
  compneyID: string;
  commits: {
    [docPath: string]:
      | { data: obj; type: "update" | "create" | "set" }
      | { type: "delete" };
  };
  tasks: Promise<null>[];
}) {
  tasks.push(removeCompneyExpireDate("distributor", compneyID, false).then());
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
}

function updateConfigDoc({
  commits,
  compneyID,
  changes,
}: {
  changes: Change<DocumentSnapshot>;
  compneyID: string;
  commits: {
    [docPath: string]:
      | { data: obj; type: "update" | "create" | "set" }
      | { type: "delete" };
  };
}) {
  const oldName = changes.before.get("name");
  const newName = changes.after.get("name");
  const oldDisabled = changes.before.get("action.disabled");
  const newDisabled = changes.after.get("action.disabled");
  if (newName !== oldName || oldDisabled !== newDisabled) {
    // ! if compney info changes
    commits["CONFIG/DISTRIBUTOR"] = {
      data: {
        [compneyID]: JSON.stringify({
          name: `${newName}`,
          disabled: newDisabled ? newDisabled : undefined,
        }),
      },
      type: "update",
    };
  }
}

function resetCompney({
  commits,
  compneyID,
  updateCurrentDoc,
  tasks,
}: {
  compneyID: string;
  commits: {
    [docPath: string]:
      | { data: obj; type: "update" | "create" | "set" }
      | { type: "delete" };
  };
  updateCurrentDoc: obj;
  tasks: Promise<null>[];
}) {
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
}

function memorizeNetwork({
  updateCurrentDoc,
  changes,
}: {
  updateCurrentDoc: obj;
  changes: Change<DocumentSnapshot>;
}) {
  const [wereSellers, areSellers] = getObject(changes, "workers");
  for (const sellerID of Object.keys(wereSellers)) {
    if (sellerID in areSellers) continue;
    // ! register ex-sellers for old records
    updateCurrentDoc[`ex-seller.${sellerID}`] = wereSellers[sellerID];
  }
  const [wereBuyers, areBuyers] = getObject(changes, "buyers");
  for (const buyerNumber of Object.keys(wereBuyers)) {
    if (buyerNumber in areBuyers) continue;
    // ! register ex-buyers for old records
    updateCurrentDoc[`ex-buyer.${buyerNumber}`] = wereBuyers[buyerNumber];
  }
}

function disableCompney({
  areOwner,
  areWorker,
  compneyID,
  tasks,
}: {
  areOwner: obj;
  areWorker: obj;
  compneyID: string;
  tasks: Promise<null>[];
}) {
  tasks.push(removeCompneyExpireDate("distributor", compneyID, true).then());
  for (const phoneNumber of Object.keys(areOwner)) {
    tasks.push(
      applyClaims(phoneNumber, compneyID, "disable").then(() => null, onError)
    );
  }
  for (const phoneNumber of Object.keys(areWorker)) {
    tasks.push(
      applyClaims(phoneNumber, compneyID, null).then(() => null, onError)
    );
  }
}

function enableCompney({
  areOwner,
  areWorker,
  compneyID,
  tasks,
  updateCurrentDoc,
}: {
  areOwner: obj;
  areWorker: obj;
  updateCurrentDoc: obj;
  compneyID: string;
  tasks: Promise<null>[];
}) {
  for (const phoneNumber of Object.keys(areOwner)) {
    tasks.push(
      applyClaims(phoneNumber, compneyID, "owner").then(function (res) {
        updateCurrentDoc[`workers.${phoneNumber}.status`] = res
          ? 1
          : res === false
          ? -1
          : 0;
        return null;
      }, onError)
    );
    for (const phoneNumber of Object.keys(areWorker)) {
      tasks.push(
        applyClaims(phoneNumber, compneyID, "worker").then(function (res) {
          updateCurrentDoc[`workers.${phoneNumber}.status`] = res
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
  const updateCurrentDoc: obj = {};
  const commits: {
    [docPath: string]:
      | { data: obj; type: "update" | "create" | "set" }
      | { type: "delete" };
  } = {};

  const wasDisabled = changes.before.get("action.disabled");
  const isDisabled = changes.after.get("action.disabled");
  const needsReset =
    changes.after.get("action.reset") !== changes.before.get("action.reset");

  const [wereOwner, areOwner] = getObject(changes, "owners");
  const [wereWorker, areWorker] = getObject(changes, "workers");

  updateRoles({
    role: "owner",
    oldNumbers: wereOwner,
    newNumbers: areOwner,
    compneyID,
    isDisabled,
    needsReset,
    tasks,
    updateCurrentDoc,
  });

  updateRoles({
    role: "worker",
    oldNumbers: wereWorker,
    newNumbers: areWorker,
    compneyID,
    isDisabled,
    needsReset,
    tasks,
    updateCurrentDoc,
  });

  if (!changes.before.exists) {
    initCompney({ changes, commits, compneyID, updateCurrentDoc, tasks });
  } else if (!changes.after.exists) {
    deleteCompney({ changes, commits, compneyID, tasks });
  } else {
    updateConfigDoc({ changes, commits, compneyID });
    if (needsReset) {
      resetCompney({ commits, compneyID, tasks, updateCurrentDoc });
    } else {
      memorizeNetwork({ changes, updateCurrentDoc });
    }
    if (!wasDisabled && isDisabled) {
      disableCompney({ areOwner, areWorker, compneyID, tasks });
    } else if (wasDisabled && !isDisabled) {
      enableCompney({
        areOwner,
        areWorker,
        compneyID,
        tasks,
        updateCurrentDoc,
      });
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
