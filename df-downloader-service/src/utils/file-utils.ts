import { logger } from "df-downloader-common";
import mv from "mv";
import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { utimes } from "utimes";

export type FilePathInfo = {
  parts: string[];
  dirs: string[];
  filename: string;
  fullPath: string;
}

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

type ListFilesOpts = {
  recursive?: boolean;
  maxDepth?: number;
  fullPath?: boolean;
}
const listAllFilesInternal = async (dir: string, opts: ListFilesOpts, depth: number) => {
  const { recursive = false, maxDepth = Infinity, fullPath = true } = opts;
  if (depth > maxDepth) {
    return [];
  }
  const files = await fs.promises.readdir(dir, { withFileTypes: true });
  const fileNames: string[] = [];
  for (const file of files) {
    if (file.isBlockDevice() || file.isCharacterDevice() || file.isSocket() || file.isSymbolicLink()) {
      continue;
    }
    if (file.isFile()) {
      const fileName = fullPath ? path.join(dir, file.name) : file.name;
      fileNames.push(fileName);
    } else if (recursive && file.isDirectory()) {
      const subDir = path.join(dir, file.name);
      const subFiles = await listAllFilesInternal(subDir, opts, depth + 1);
      fileNames.push(...subFiles);
    }
  }
  return fileNames;
}
export const listAllFiles = async (dir: string, opts: ListFilesOpts) => {
  return listAllFilesInternal(dir, opts, 0);
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

// Characters that are not allowed
const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
// Windows reserved names (these are not allowed as filenames). They can be part of a filename but not the whole filename.
const reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export const oldSanitizeFileName = (fileName: string) => {
  return fileName.replace(/[^a-zA-Z0-9-_]/g, "_");
};

export const sanitizeFilename = (filename: string) => {
  let sanitized = filename.replace(invalidChars, "_");
  if (reservedNames.test(sanitized)) {
    sanitized = "_" + sanitized;
  }
  // Trim any leading/trailing whitespace and dots
  sanitized = sanitized.trim().replace(/^\.+/, "").replace(/\.+$/, "");
  return sanitized;
};

export const sanitizeFilePath = (filePath: string): FilePathInfo => {
  // Split on either Windows or Unix path separator
  const pathSeparator = /[\\/]/;
  // split the filename by path separator
  const parts = filePath.split(pathSeparator).map((part) => sanitizeFilename(part));
  return {
    parts,
    dirs: parts.length > 1 ? parts.slice(0, -1) : [],
    filename: parts[parts.length - 1],
    fullPath: parts.join(path.sep),
  }
};