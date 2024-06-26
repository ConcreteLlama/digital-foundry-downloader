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

export const makeErrorMessage = (e: any) => {
  if (e?.message) {
    return e.message;
  } else if (typeof e === "string") {
    return e;
  } else if (e?.toString) {
    return e.toString();
  } else {
    return "Unknown error";
  }
};

export const capitalizeFirstLetter = (s: string) => {
  return s.charAt(0).toUpperCase() + s.slice(1);
};
