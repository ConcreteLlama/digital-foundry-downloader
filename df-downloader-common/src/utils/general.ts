export const xor = (a: any, b: any) => {
  return (a || b) && !(a && b);
};

export const asyncSome = async <INPUT, OUTPUT>(
  array: INPUT[],
  predicate: (item: INPUT) => Promise<OUTPUT>
): Promise<boolean> => {
  for (const item of array) {
    if (await predicate(item)) {
      return true;
    }
  }
  return false;
};

export const asyncGetFirstMatch = async <INPUT, OUTPUT>(
  array: INPUT[],
  predicate: (item: INPUT) => Promise<OUTPUT>
): Promise<OUTPUT | null> => {
  for (const item of array) {
    const result = await predicate(item);
    if (result) {
      return result;
    }
  }
  return null;
};

export const transformFirstMatchAsync = async <INPUT, OUTPUT>(
  array: INPUT[],
  predicate: (item: INPUT) => OUTPUT | Promise<OUTPUT>
): Promise<OUTPUT | null> => {
  for (const item of array) {
    const result = await predicate(item);
    if (result) {
      return result;
    }
  }
  return null;
};

export const transformFirstMatch = <INPUT, OUTPUT>(
  array: INPUT[],
  predicate: (item: INPUT) => OUTPUT | null
): OUTPUT | null => {
  for (const item of array) {
    const result = predicate(item);
    if (result) {
      return result;
    }
  }
  return null;
};

export const filterAndMap = <INPUT, OUTPUT>(
  array: INPUT[],
  filter: (item: INPUT, index: number) => boolean,
  map: (item: INPUT, originalIndex: number) => OUTPUT
): OUTPUT[] => {
  return array.reduce((acc, item, index) => {
    if (filter(item, index)) {
      acc.push(map(item, index));
    }
    return acc;
  }, [] as OUTPUT[]);
};

export const filterEmpty = <INPUT>(
  array: (INPUT | null | undefined)[],
): INPUT[] => {
  return array.filter((item) => item !== null && item !== undefined) as INPUT[];
}

export const mapFilterEmpty = <INPUT, OUTPUT>(
  array: INPUT[],
  map: (item: INPUT, index: number) => OUTPUT | null | undefined
): OUTPUT[] => {
  return array.reduce((acc, item, index) => {
    const mapped = map(item, index);
    if (mapped !== null && mapped !== undefined) {
      acc.push(mapped);
    }
    return acc;
  }, [] as OUTPUT[]);
};

export const mapFilterFalsey = <INPUT, OUTPUT>(
  array: INPUT[],
  map: (item: INPUT, index: number) => OUTPUT | null | undefined | false | 0
): OUTPUT[] => {
  return array.reduce((acc, item, index) => {
    const mapped = map(item, index);
    if (mapped) {
      acc.push(mapped);
    }
    return acc;
  }, [] as OUTPUT[]);
};

export const makeErrorMessage = (e: any): string => {
  if (e?.message) {
    return typeof e.message === "string" ? e.message : JSON.stringify(e.message);
  } else if (typeof e === "string") {
    return e;
  } else{
    return JSON.stringify(e);
  }
};

export const capitalizeFirstLetter = (s: string) => {
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const splitPromiseSettledResult = <T>(results: PromiseSettledResult<T>[]) => results.reduce((acc, result) => {
  if (result.status === 'fulfilled') {
    acc.fulfilled.push(result.value);
  } else {
    acc.rejected.push(result.reason);
  }
  return acc;
}, { fulfilled: [] as T[], rejected: [] as any[] });

export const isSubsetOf = (a: Set<any>, b: Set<any>) => a.size === 0 ? true : [...a].every((item) => b.has(item));

export const diffSets = (a: Set<any>, b: Set<any>) => {
  const diff = new Set([...a].filter((item) => !b.has(item)));
  return diff;
};

export const arrayIsEqual = (a: any[], b: any[]) => {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}