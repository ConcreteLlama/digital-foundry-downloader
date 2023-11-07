export const xor = (a: any, b: any) => {
  return (a || b) && !(a && b);
};

export const asyncSome = async <INPUT>(array: INPUT[], predicate: (item: INPUT) => Promise<boolean>): Promise<boolean> => {
  for (const item of array) {
    if (await predicate(item)) {
      return true;
    }
  }
  return false;
};

export const transformFirst = async <INPUT, OUTPUT>(array: INPUT[], predicate: (item: INPUT) => OUTPUT | Promise<OUTPUT>): Promise<OUTPUT | null> => {
  for (const item of array) {
    const result = predicate(item);
    if (result) {
      return result;
    }
  }
  return null;
};