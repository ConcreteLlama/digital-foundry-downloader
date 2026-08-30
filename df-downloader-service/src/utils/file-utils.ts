import { logger, sanitizeFilename, SanitizeFilenameOptions } from "df-downloader-common";
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

export type FilePathInfo = {
  /** Each constituent part of the path (directories + filename) */
  parts: string[];
  /** The directories in the path */
  dirs: string[];
  /** The filename */
  filename: string;
  /** The file extension */
  extenstion?: string;
  /** The full path */
  fullPath: string;
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
        extenstion: file.name.split('.').pop(),
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

/**
 * Prefix used for the half-written files that metadata injection and sidecar
 * writing produce before renaming them into place. Dot-prefixed so media
 * servers ignore them while they exist.
 */
export const TEMP_FILE_PREFIX = ".df-downloader-tmp-";

/**
 * Removes temp files left behind by a process that was killed mid-write.
 *
 * Those writes clean up after themselves, but only if the process lives long
 * enough to run the cleanup - a container restart or a kill leaves the file
 * behind. Since these are written *into the destination directory* (so the
 * final rename is atomic), an orphan sits in the media library indefinitely
 * at the full size of whatever was being remuxed. Harmless to playback,
 * because media servers skip dotfiles, but hundreds of megabytes each.
 *
 * Safe to run at startup: nothing else uses this prefix, and anything
 * genuinely in progress can't exist yet because nothing has started.
 */
export const cleanUpOrphanedTempFiles = async (dirs: string[], maxDepth: number) => {
  let removed = 0;
  let bytes = 0;
  for (const dir of dirs) {
    if (!dir || !(await fileExists(dir))) {
      continue;
    }
    const files = await listAllFiles(dir, { recursive: true, maxDepth }).catch(() => []);
    for (const file of files) {
      if (!file.filename.startsWith(TEMP_FILE_PREFIX)) {
        continue;
      }
      const size = await fs.promises
        .stat(file.fullPath)
        .then((stat) => stat.size)
        .catch(() => 0);
      const deleted = await fs.promises
        .rm(file.fullPath, { force: true })
        .then(() => true)
        .catch(() => false);
      if (deleted) {
        removed++;
        bytes += size;
      }
    }
  }
  if (removed) {
    logger.log(
      "info",
      `Cleaned up ${removed} leftover temporary file(s) (${Math.round(bytes / 1048576)}MB) from an interrupted run`
    );
  }
};

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

export const sanitizeFilePath = (filePath: string, sanitizeOpt: SanitizeFilenameOptions = {}): FilePathInfo => {
  // Split on either Windows or Unix path separator
  const pathSeparator = /[\\/]/;
  // split the filename by path separator
  const parts = filePath.split(pathSeparator).map((part) => sanitizeFilename(part, sanitizeOpt));
  const filename = parts[parts.length - 1];
  return {
    parts,
    dirs: parts.length > 1 ? parts.slice(0, -1) : [],
    filename,
    fullPath: parts.join('/'),
    extenstion: filename.split('.').pop(),
  }
};

export const pathIsEqual = (path1: string, path2: string) => path.resolve(path1) === path.resolve(path2);
/**
 * Writes a file via a temp file and a rename, retrying the rename.
 *
 * Temp-then-rename is the usual way to avoid a reader seeing a
 * half-written file: the rename is atomic within a directory, so a reader
 * sees either the old contents or the new ones. On Windows that rename can
 * still fail with EPERM when something else briefly holds a handle to
 * either file - a sync client, an indexer, or a virus scanner opening the
 * temp file the moment it appears. This is not hypothetical: it happens
 * reliably when the DB directory sits inside a Nextcloud/Dropbox-synced
 * folder, which is a perfectly reasonable place for someone to keep it.
 *
 * A handle like that is held for a moment, not permanently, so retrying
 * with a short backoff clears it. If it somehow does not, the last resort
 * is writing straight over the destination: that gives up atomicity, which
 * is a real loss, but losing the write entirely is worse - the alternative
 * is data the caller believes was saved and was not.
 */
export const writeFileAtomic = async (filePath: string, contents: string): Promise<void> => {
  const tempPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tempPath, contents, { encoding: "utf-8" });

  const delaysMs = [0, 25, 75, 200];
  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    if (delaysMs[attempt]) {
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
    try {
      // ENOENT means the temp file went missing between writing it and
      // renaming it - a sync client moving it aside does exactly this. The
      // rename can never succeed on its own after that, since the source is
      // gone, so put it back before trying again.
      if (attempt > 0 && !fs.existsSync(tempPath)) {
        await fs.promises.writeFile(tempPath, contents, { encoding: "utf-8" });
      }
      await fs.promises.rename(tempPath, filePath);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      // Transient sharing violations, and a temp file pulled out from under
      // us, are worth retrying. Anything else (a bad path, a genuinely
      // missing directory) will not fix itself - though ENOENT for that
      // reason still ends up here, and simply fails again on the fallback
      // write below rather than being swallowed.
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY" && code !== "ENOENT") {
        await fs.promises.rm(tempPath, { force: true }).catch(() => {});
        throw e;
      }
    }
  }

  logger.log(
    "warn",
    `Could not rename ${path.basename(tempPath)} into place after retries - writing directly. Something is holding a handle on this directory (a file sync client or virus scanner is the usual cause).`
  );
  await fs.promises.writeFile(filePath, contents, { encoding: "utf-8" });
  await fs.promises.rm(tempPath, { force: true }).catch(() => {});
};
