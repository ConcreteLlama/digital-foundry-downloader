export function ensureEnvString(envName: string, defaultVal?: string, validOptions?: string[] | readonly any[]) {
  const toReturn = ensureEnvVar(envName, defaultVal);
  if (validOptions) {
    if (!validOptions.includes(toReturn)) {
      throw new Error(`${toReturn} is not a valid option for ${envName} - valid options are ${validOptions}`);
    }
  }
  return toReturn;
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

export function ensureEnvStringArray(envName: string, defaultVal?: string[], validOptions?: string[]) {
  const envVar = ensureEnvVar(envName, defaultVal);
  let toReturn: string[];
  if (typeof envVar === "string") {
    toReturn = envVar.split(",").map((value) => value.trim());
  } else {
    toReturn = envVar;
  }
  if (validOptions) {
    toReturn.forEach((val) => {
      if (!validOptions.includes(val)) {
        throw new Error(`${val} is not a valid option for ${envName} - valid options are ${validOptions}`);
      }
    });
  }
  return toReturn;
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
