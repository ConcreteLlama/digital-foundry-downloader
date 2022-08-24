import fs from "node:fs";
import mv from "mv";

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
