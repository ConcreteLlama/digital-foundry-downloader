import { logger, sanitizeFilename } from "df-downloader-common";
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
}
const listAllFilesInternal = async (dirPaths: string[], opts: ListFilesOpts, depth: number): Promise<FilePathInfo[]> => {
  const { recursive = false, maxDepth = Infinity } = opts;
  if (depth > maxDepth) {
    return [];
  }
  const files = await fs.promises.readdir(dirPaths.join(path.sep), { withFileTypes: true });
  const filePathInfos: FilePathInfo[] = [];
  for (const file of files) {
    if (file.isBlockDevice() || file.isCharacterDevice() || file.isSocket() || file.isSymbolicLink()) {
      continue;
    }
    if (file.isFile()) {
      filePathInfos.push({
        filename: file.name,
        fullPath: path.join(...dirPaths, file.name),
        dirs: dirPaths,
        parts: [...dirPaths, file.name],
      });
    } else if (recursive && file.isDirectory() && depth < maxDepth) {
      const subFiles = await listAllFilesInternal([...dirPaths, file.name], opts, depth + 1);
      filePathInfos.push(...subFiles);
    }
  }
  return filePathInfos;
}
export const listAllFiles = async (dir: string, opts: ListFilesOpts) => {
  return listAllFilesInternal([dir], opts, 0);
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

export const sanitizeFilePath = (filePath: string): FilePathInfo => {
  // Split on either Windows or Unix path separator
  const pathSeparator = /[\\/]/;
  // split the filename by path separator
  const parts = filePath.split(pathSeparator).map((part) => sanitizeFilename(part));
  return {
    parts,
    dirs: parts.length > 1 ? parts.slice(0, -1) : [],
    filename: parts[parts.length - 1],
    fullPath: parts.join('/'),
  }
};