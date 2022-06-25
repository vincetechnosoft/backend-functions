import { CallableContext } from "firebase-functions/v1/https";
import { fieldValue, fs, httpsError } from "../setup";
import { formatedDate } from "../utils";

interface FormData {
  email: string;
  fullName: string;
  phoneNumber: string;
  city: string;
  department: string;
  portfolio: string;
  cv: string;
}

export default async function PUBLICcareers(
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
    [
      data.email,
      data.fullName,
      data.city,
      data.phoneNumber,
      data.cv,
      data.department,
      data.portfolio,
    ].findIndex((x) => typeof x !== "string") > -1
  ) {
    throw new httpsError("invalid-argument", "Wrong formate given");
  }
  try {
    await fs.doc("PUBLIC/CAREERS").update({
      [formatedDate()]: fieldValue.arrayUnion({
        e: data.email,
        n: data.fullName,
        p: data.phoneNumber,
        c: data.city,
        d: data.department,
        pf: data.portfolio,
        cv: data.cv,
      }),
    });
  } catch {
    throw new httpsError("internal", "Something went wrong on server");
  }
}
