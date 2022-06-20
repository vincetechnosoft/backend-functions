import { Change, EventContext } from "firebase-functions/v1";
import { DataSnapshot } from "firebase-functions/v1/database";
import { log, setUserClaims } from "../configData";
import { auth } from "../setup";
import { validatePhoneForE164 } from "../utils";

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
        setUserClaims(user.uid, claim).then(() => true),
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
