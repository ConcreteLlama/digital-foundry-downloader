import { logger } from "df-downloader-common";
import mv from "mv";
import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { utimes } from "utimes";

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
    return path.toString();
  }
  fs.mkdirSync(path, {
    recursive: true,
  });
  checkDir(path);
  return path.toString();
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

export function extractFilenameFromUrl(url: string) {
  const pathname = new URL(url).pathname;
  return decodeURIComponent(pathname.substring(pathname.lastIndexOf("/") + 1));
}

const __filename = fileURLToPath(import.meta.url);
export const code_dir = path.join(dirname(__filename), "..", "..");

export const setDateOnFile = async (filename: string, creationDate: Date) => {
  try {
    const timestamp = creationDate.getTime();
    await utimes(filename, {
      btime: timestamp,
      mtime: timestamp,
      atime: timestamp,
    });
  } catch (e) {
    logger.log("error", e);
  }
};

export const fileExists = async (path: string) => {
  return await fs.promises
    .stat(path)
    .then(() => true)
    .catch(() => false);
};

export const deleteFile = async (path: string) => {
  return await fs.promises
    .rm(path)
    .then(() => true)
    .catch(() => false);
};
