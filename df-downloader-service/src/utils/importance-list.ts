/**
 * Finds the item in the given array with the highest importance, as determined by a separate list of importance levels.
 *
 * @param {string[]} importanceList - An array of strings representing the importance levels of items, in descending order of importance.
 * @param {T[]} items - An array of generically typed items to search for the most important one.
 * @param {function(T): string} importanceGetter - A function that takes an item of type `T` and returns the field used to determine its importance.
 * @returns {T} The item in the `items` array with the highest importance - if no item has an importance level in the `importanceList`, the first item in the `items` array is returned.
 */
export function getMostImportantItem<T>(
  importanceList: string[],
  items: T[],
  importanceGetter: (item: T) => string,
  mustMatch: boolean = false
): T | undefined {
  const [mostImportantItem, itemImportanceIndex] = items.reduce(
    ([currentMostImportantItem, currentHighestImportanceIndex], currentItem) => {
      const itemImportanceIndex = importanceList.indexOf(importanceGetter(currentItem));
      if (itemImportanceIndex !== -1 && itemImportanceIndex < currentHighestImportanceIndex) {
        return [currentItem, itemImportanceIndex];
      }
      return [currentMostImportantItem, currentHighestImportanceIndex];
    },
    [items[0], Infinity]
  );

  return itemImportanceIndex === Infinity ? (mustMatch ? undefined : items[0]) : mostImportantItem;
}
