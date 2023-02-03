import mv from "mv";
import fs from "node:fs";

export function checkDir(path: fs.PathLike) {
  if (fs.existsSync(path)) {
    if (!fs.statSync(path).isDirectory()) {
      throw new Error(`File ${path} exists but is not a directory`);
    }
    return true;
  }
  return false;
}

export function ensureDirectory(path: fs.PathLike) {
  if (checkDir(path)) {
    return;
  }
  fs.mkdirSync(path, {
    recursive: true,
  });
  checkDir(path);
}

export async function moveFile(source: string, dest: string, options: mv.Options) {
  return new Promise((resolve, reject) => {
    mv(source, dest, options, (error?: any) => {
      if (error) {
        reject(error);
      } else {
        resolve("complete");
      }
    });
  });
}

const KB = 1000;
const KiB = 1024;
const MB = Math.pow(KB, 2);
const MiB = Math.pow(KiB, 2);
const GB = Math.pow(KB, 3);
const GiB = Math.pow(KiB, 3);
const TB = Math.pow(KB, 4);
const TiB = Math.pow(KiB, 4);
const PB = Math.pow(KB, 5);
const PiB = Math.pow(KiB, 5);

export function getSizeMultiplier(sizeFormat?: string) {
  if (!sizeFormat) {
    return 1;
  }
  sizeFormat = sizeFormat.toLowerCase().trim();
  if (sizeFormat === "b" || sizeFormat === "B") {
    return 1;
  } else if (sizeFormat === "k" || sizeFormat === "kb") {
    return KB;
  } else if (sizeFormat === "kib") {
    return KiB;
  } else if (sizeFormat === "m" || sizeFormat === "mb") {
    return MB;
  } else if (sizeFormat === "mib") {
    return MiB;
  } else if (sizeFormat === "g" || sizeFormat === "gb") {
    return GB;
  } else if (sizeFormat === "gib") {
    return GiB;
  } else if (sizeFormat === "t" || sizeFormat === "tb") {
    return TB;
  } else if (sizeFormat === "tib") {
    return TiB;
  } else if (sizeFormat === "p" || sizeFormat === "pb") {
    return PB;
  } else if (sizeFormat === "pib") {
    return PiB;
  }
  throw new Error(`Cannot determine byte multiplier from ${sizeFormat}`);
}

export function fileSizeStringToBytes(fileSizeString: string) {
  const matchResult = fileSizeString.match(/([0-9]+\.?[0-9]*)\s*([A-Za-z]*)/);
  if (!matchResult || matchResult.length < 1) {
    throw new Error(`Unable to parse size from ${fileSizeString}`);
  }
  const sizeNum = parseFloat(matchResult[1]);
  let sizeMultiplier = 1;
  if (matchResult.length > 1) {
    sizeMultiplier = getSizeMultiplier(matchResult[2]);
  }
  const size = sizeNum * sizeMultiplier;
  return size;
}

export function extractFilenameFromUrl(url: string) {
  const pathname = new URL(url).pathname;
  return decodeURIComponent(pathname.substring(pathname.lastIndexOf("/") + 1));
}
