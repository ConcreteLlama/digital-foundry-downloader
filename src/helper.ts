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

export function ensureEnvString(envName: string, defaultVal?: string) {
  return ensureEnvVar(envName, defaultVal);
}

export function ensureEnvVar<T>(envName: string, defaultVal?: T) {
  const envVar = process.env[envName];
  if (!envVar) {
    if (defaultVal) {
      return defaultVal;
    }
    throw new Error(`${envName} environment variable must be set`);
  }
  return envVar;
}

export function ensureEnvBoolean(envName: string, defaultVal?: boolean) {
  const envVar = ensureEnvVar(envName, defaultVal);
  if (typeof envVar === "string") {
    const trimmed = envVar.toLowerCase().trim();
    if (trimmed === "true") {
      return true;
    } else if (trimmed === "false") {
      return false;
    }
    throw new Error(`${envName} environment variable must true or false`);
  }
  return envVar;
}

export function ensureEnvStringArray(envName: string, defaultVal?: string[]) {
  const envVar = ensureEnvVar(envName, defaultVal);
  if (typeof envVar === "string") {
    return envVar.split(",").map((value) => value.trim());
  }
  return envVar;
}

export function ensureEnvInteger(envName: string, defaultVal?: number) {
  const envVar = process.env[envName];
  if (!envVar) {
    if (defaultVal) {
      return defaultVal;
    } else {
      throw new Error(`${envName} environment variable must be set`);
    }
  }
  const asNumber = parseInt(envVar);
  if (isNaN(asNumber)) {
    throw new Error(`${envName} environment variable must be a number`);
  }
  return asNumber;
}

export class ScoreMap {
  scoredItems: { [key: string]: number };

  constructor(stringArray: string[]) {
    this.scoredItems = {};
    stringArray.forEach((key, index, array) => {
      this.scoredItems[key.toLowerCase()] = array.length + 1 - index;
    });
  }

  getScore(toScore: string) {
    return this.scoredItems[toScore.toLowerCase()] || 0;
  }

  compare(a: string, b: string) {
    return this.getScore(b) - this.getScore(a);
  }

  sortList<T>(list: T[], scoreParmGetter: (item: T) => string) {
    return list.sort((a, b) => {
      const aScoreParm = scoreParmGetter(a);
      const bScoreParm = scoreParmGetter(b);
      return this.compare(aScoreParm, bScoreParm);
    });
  }

  getTopScoredItem<T>(list: T[], scoreParmGetter: (item: T) => string) {
    return list.length === 0 ? undefined : this.sortList(list, scoreParmGetter)[0];
  }
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
