import { Change, EventContext } from "firebase-functions/v1";
import { DataSnapshot } from "firebase-functions/v1/database";
import { auth, log, validatePhoneForE164 } from "../utils";

export default async function applyClaimsToPhoneNumber(
  changes: Change<DataSnapshot>,
  context: EventContext
) {
  const phoneNumber = context.params.phoneNumber;
  const claim = changes.after.val() || null;

  async function logInError<T>(promice: Promise<T>, message: string) {
    return promice.catch((error) => log({ message, error, phoneNumber }));
  }
  if (!validatePhoneForE164(phoneNumber)) {
    await log({
      message: "phoneNumber is invalid",
      claim,
      phoneNumber,
    });
  } else if (typeof claim !== "object") {
    await log({
      message: "claim is invalid, claim mush be object || undefined",
      claim,
      phoneNumber,
    });
  } else {
    let user = await logInError(
      auth.getUserByPhoneNumber(phoneNumber),
      "while getting user"
    );
    user ??= await logInError(
      auth.createUser({ phoneNumber }),
      "while creating user"
    );
    if (
      user &&
      (await logInError(
        auth.setCustomUserClaims(user.uid, claim).then(() => true),
        "while applying claims"
      ))
    ) {
      if (claim) {
        await log({
          message: "claims applyed successfully",
          claim: (await auth.getUser(user.uid)).customClaims,
          phoneNumber,
        });
      } else {
        await log({
          message: "claims empted successfully",
          phoneNumber,
        });
      }
    }
  }
}