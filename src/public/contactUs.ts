import { CallableContext } from "firebase-functions/v1/https";
import { fieldValue, fs, httpsError } from "../setup";
import { formatedDate } from "../utils";

interface FormData {
  fullName: string;
  email: string;
  phoneNumber: string;
  message: string;
}

export default async function PUBLICcontactUs(
  data: FormData,
  context: CallableContext
) {
  if (context.app == undefined) {
    throw new httpsError(
      "failed-precondition",
      "The function must be called from an App Check verified app."
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    [data.email, data.fullName, data.message, data.phoneNumber].findIndex(
      (x) => typeof x !== "string"
    ) > -1
  ) {
    throw new httpsError("invalid-argument", "Wrong formate given");
  }
  try {
    await fs.doc("PUBLIC/CONTACT-US").update({
      [formatedDate()]: fieldValue.arrayUnion({
        e: data.email,
        n: data.fullName,
        p: data.phoneNumber,
        m: data.message,
      }),
    });
  } catch (err) {
    throw new httpsError("internal", "Something went wrong on server");
  }
}
