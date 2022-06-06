import { EventContext } from "firebase-functions/v1";
import { ObjectMetadata } from "firebase-functions/v1/storage";
import { fs, apkBucket } from "../utils";

interface AppInfoParserRes {
  versionCode: number;
  versionName: string;
  icon: string;
}

export default async function apkChanges(
  object: ObjectMetadata,
  _: EventContext
) {
  const name = object.name;
  if (!name) return;
  if (!name.includes("/") && name.endsWith(".apk")) {
    // ? b2b-main.apk ==> b2b-main
    const _name = name.substring(0, name.length - 4);
    const path = await import("path");
    const os = await import("os");
    const apkPath = path.join(os.tmpdir(), "newApp.apk");
    await apkBucket.file(name).download({ destination: apkPath });

    const AppInfoParser = require("app-info-parser");

    await new AppInfoParser(apkPath)
      .parse()
      .then(function (res: AppInfoParserRes) {
        return fs.doc("CONFIG/ANDROID_APK_LOG").update({
          [`${_name}.icon`]: res.icon,
          [`${_name}.version`]: res.versionCode,
          [`${_name}.versionName`]: res.versionName,
        });
      });
  } else if (
    name.startsWith("ICONS/") &&
    name.includes(".") &&
    name.lastIndexOf("/") === 5
  ) {
    const _name = name.substring(6, name.indexOf("."));
    await apkBucket
      .file(name)
      .makePublic()
      .then(function () {
        return fs
          .doc("CONFIG/ANDROID_APK_LOG")
          .update({ [`${_name}.image`]: object.mediaLink });
      });
  }
}

/**
  Example
  
  res: {
    kind: "storage#objectAccessControl",
    object: "ICONS/b2b-main.png",
    generation: "1651597500536165",
    id: "bmi-apks/ICONS/b2b-main.png/1651597500536165/allUsers",
    selfLink: "https://www.googleapis.com/storage/v1/b/bmi-apks/o/ICONS%2Fb2b-main.png/acl/allUsers",
    bucket: "bmi-apks",
    entity: "allUsers",
    role: "READER",
    etag: "COWq05Low/cCEAI=",
  },
  object: {
    bucket: "bmi-apks",
    contentDisposition: "inline; filename*=utf-8''b2b-main.png",
    contentType: "image/png",
    crc32c: "OL0KmA==",
    etag: "COWq05Low/cCEAE=",
    generation: "1651597500536165",
    id: "bmi-apks/ICONS/b2b-main.png/1651597500536165",
    kind: "storage#object",
    md5Hash: "OaUtk5/E4m8RiO82t7LBkw==",
    mediaLink: "https://www.googleapis.com/download/storage/v1/b/bmi-apks/o/ICONS%2Fb2b-main.png?generation=1651597500536165&alt=media",
    metadata: { firebaseStorageDownloadTokens: "0439858e-d2c3-4e86-b2c4-ee785ff8500f" },
    metageneration: "1",
    name: "ICONS/b2b-main.png",
    selfLink: "https://www.googleapis.com/storage/v1/b/bmi-apks/o/ICONS%2Fb2b-main.png",
    size: "23329",
    storageClass: "REGIONAL",
    timeCreated: "2022-05-03T17:05:00.543Z",
    timeStorageClassUpdated: "2022-05-03T17:05:00.543Z",
    updated: "2022-05-03T17:05:00.543Z",
  },
*/
