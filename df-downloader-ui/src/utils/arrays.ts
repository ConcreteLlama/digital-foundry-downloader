export const arrayToMap = <K, V>(array: V[], keyExtractor: (value: V) => K) => {
  const toReturn = new Map<K, V>();
  for (const entry of array) {
    toReturn.set(keyExtractor(entry), entry);
  }
  return toReturn;
};
