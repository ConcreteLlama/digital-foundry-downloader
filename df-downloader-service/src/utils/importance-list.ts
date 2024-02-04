/**
 * Finds the item in the given array with the highest importance, as determined by a separate list of importance levels.
 *
 * @param {string[]} importanceList - An array of strings representing the importance levels of items, in descending order of importance.
 * @param {T[]} items - An array of generically typed items to search for the most important one.
 * @param {function(T): string} importanceIndexGetter - A function that takes the importance list and an item and returns the importance level of the item.
 * @returns {T} The item in the `items` array with the highest importance - if no item has an importance level in the `importanceList`, the first item in the `items` array is returned.
 */
export const getMostImportantItem = <IMPORTANCE_LIST_TYPE, ITEM_LIST_TYPE>(
  importanceList: IMPORTANCE_LIST_TYPE,
  items: ITEM_LIST_TYPE[],
  importanceIndexGetter: (importanceList: IMPORTANCE_LIST_TYPE, item: ITEM_LIST_TYPE) => number,
  mustMatch: boolean = false
): ITEM_LIST_TYPE | undefined => {
  const [mostImportantItem, itemImportanceIndex] = items.reduce(
    ([currentMostImportantItem, currentHighestImportanceIndex], currentItem) => {
      const itemImportanceIndex = importanceIndexGetter(importanceList, currentItem);
      if (itemImportanceIndex !== -1 && itemImportanceIndex < currentHighestImportanceIndex) {
        return [currentItem, itemImportanceIndex];
      }
      return [currentMostImportantItem, currentHighestImportanceIndex];
    },
    [items[0], Infinity]
  );

  return itemImportanceIndex === Infinity ? (mustMatch ? undefined : items[0]) : mostImportantItem;
};
