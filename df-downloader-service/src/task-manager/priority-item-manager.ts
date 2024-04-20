class PriorityNode<T> {
  constructor(
    public readonly item: T,
    public readonly priority: number,
    public next: PriorityNode<T> | null = null,
    public prev: PriorityNode<T> | null = null
  ) {}
}

export type PriorityPositionInfo = {
  position: number;
  priorityPosition: number;
  priority: number;
};

/**
 * Manages items in priority order, with the intention that priority is a finite set of possible values
 * A low priority number is considered higher priority
 * Items can be added, removed, and updated
 * Items can change priority and also be reordered within the same priority
 */
export class PriorityItemManager<T> {
  private readonly priorityNodeMap: Map<number, PriorityNode<T>> = new Map();
  private readonly itemMap: Map<T, PriorityNode<T>> = new Map();
  private head: PriorityNode<T> | null = null;
  private tail: PriorityNode<T> | null = null;

  /**
   * Adds an item to the priority list
   * @param item
   * @param priority
   * @param positionInPriority The position within the priority to add the item. Can be "first", "last", or a number
   */
  addItem(item: T, priority: number, positionInPriority: "first" | "last" | number = "last") {
    const newNode = new PriorityNode(item, priority);
    // If this is the highest priority item, set it to the head
    if (!this.head || priority < this.head.priority) {
      if (this.head) {
        this.head.prev = newNode;
      }
      newNode.next = this.head;
      this.head = newNode;
    } else {
      let current = this.head;
      // Find the priority head
      while (current.next && current.next.priority < priority) {
        current = current.next;
        if (current.next && current.next.priority >= priority) {
          current = current.next;
        }
      }
      positionInPriority = positionInPriority === "first" ? 0 : positionInPriority;
      if (positionInPriority === "last") {
        // Loop through the priority head to find the last item with the same priority
        while (current.next && current.next.priority === priority) {
          current = current.next;
        }
        newNode.next = current.next;
        newNode.prev = current;
        if (current.next) {
          current.next.prev = newNode;
        }
        current.next = newNode;
      } else {
        // Loop through the priority head to find the item at the specified position
        for (let i = 0; i < positionInPriority; i++) {
          if (!current.next || current.next.priority !== priority) {
            break;
          }
          current = current.next;
        }
        newNode.prev = current.prev;
        newNode.next = current;
        if (current.prev) {
          current.prev.next = newNode;
        }
        current.prev = newNode;
      }
    }
    if (!newNode.prev) {
      this.head = newNode;
    }
    if (!newNode.next) {
      this.tail = newNode;
    }
    if (!this.priorityNodeMap.has(priority) || this.priorityNodeMap.get(priority) === newNode.next) {
      this.priorityNodeMap.set(priority, newNode);
    }
    this.itemMap.set(item, newNode);
  }

  /**
   * Removes an item from the priority list
   * @param item
   * @returns
   */
  removeItem(item: T) {
    const node = this.itemMap.get(item);
    if (!node) {
      return;
    }
    this.removeNode(node);
  }

  private removeNode(node: PriorityNode<T>) {
    this.itemMap.delete(node.item);
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    const currentPriorityHead = this.priorityNodeMap.get(node.priority);
    if (currentPriorityHead === node) {
      this.priorityNodeMap.delete(node.priority);
      if (node.next) {
        this.priorityNodeMap.set(node.priority, node.next);
      }
    }
  }

  /**
   * Chang the priority of an item (this just removes and re-inserts it)
   * @param item
   * @param newPriority
   * @param positionInPriority
   */
  changePriority(item: T, newPriority: number, positionInPriority: "first" | "last" | number = "last") {
    this.removeItem(item);
    this.addItem(item, newPriority, positionInPriority);
  }

  /**
   * Change the position of an item within the same priority (again, this just removes and re-inserts it)
   * @param item
   * @param positionInPriority
   */
  changePositionInPriority(item: T, positionInPriority: "first" | "last" | number) {
    const node = this.itemMap.get(item);
    if (!node) {
      return;
    }
    this.removeNode(node);
    this.addItem(item, node.priority, positionInPriority);
  }

  getItemPriority(item: T) {
    const node = this.itemMap.get(item);
    return node?.priority;
  }

  /**
   * Returns the position of an item in the priority list, as well as the position within the priority and its current priority
   * This is computed each time with O(n) complexity so, uh, bear that in mind
   * If you're going to be calling this a lot for every item, you might want to use getItemPositionInfoMap instead
   * @param item
   * @returns
   */
  getItemPositionInfo(item: T): PriorityPositionInfo | null {
    const node = this.itemMap.get(item);
    if (!node) {
      return null;
    }
    let current = this.head;
    let position = 0;
    let priorityPosition = 0;
    while (current) {
      if (current === node) {
        break;
      }
      if (current.priority === node.priority) {
        priorityPosition++;
      }
      position++;
      current = current.next;
    }
    return { position, priorityPosition, priority: node.priority };
  }

  forEach(callback: (item: T, info: PriorityPositionInfo) => void) {
    let current = this.head;
    let position = 0;
    let priorityPosition = 0;
    while (current) {
      callback(current.item, { priority: current.priority, position, priorityPosition });
      position++;
      if (!current.next || current.next.priority !== current.priority) {
        priorityPosition = 0;
      } else {
        priorityPosition++;
      }
      current = current.next;
    }
  }

  map<U>(callback: (item: T, info: PriorityPositionInfo) => U) {
    const results: U[] = [];
    this.forEach((item, info) => {
      results.push(callback(item, info));
    });
    return results;
  }

  filter(callback: (item: T, info: PriorityPositionInfo) => boolean) {
    const results: T[] = [];
    this.forEach((item, info) => {
      if (callback(item, info)) {
        results.push(item);
      }
    });
    return results;
  }

  /**
   * Get a Map of items to their position info; if you're regularly in need of the position info for
   * all items, this is more efficient than calling getItemPositionInfo for each item
   * @returns
   */
  getItemPositionInfoMap(): Map<T, PriorityPositionInfo> {
    return new Map(this.map((item, info) => [item, info]));
  }

  private swapNodes(node1: PriorityNode<T>, node2: PriorityNode<T>) {
    const node1Next = node1.next;
    const node1Prev = node1.prev;
    const node2Next = node2.next;
    const node2Prev = node2.prev;

    node1.next = node1 === node2Next ? node2 : node2Next;
    node1.prev = node1 === node2Prev ? node2 : node2Prev;

    node2.next = node2 === node1Next ? node1 : node1Next;
    node2.prev = node2 === node1Prev ? node1 : node1Prev;

    if (node1.prev) {
      node1.prev.next = node1;
    }
    if (node1.next) {
      node1.next.prev = node1;
    }
    if (node2.prev) {
      node2.prev.next = node2;
    }
    if (node2.next) {
      node2.next.prev = node2;
    }

    if (this.head === node1) {
      this.head = node2;
    } else if (this.head === node2) {
      this.head = node1;
    }
    if (this.tail === node1) {
      this.tail = node2;
    } else if (this.tail === node2) {
      this.tail = node1;
    }

    if (this.priorityNodeMap.get(node1.priority) === node1) {
      this.priorityNodeMap.set(node1.priority, node2);
    } else if (this.priorityNodeMap.get(node1.priority) === node2) {
      this.priorityNodeMap.set(node1.priority, node1);
    }
  }

  /**
   * Shifts the item up (moves it to in earlier position in the list).
   * @param item
   * @param allowPriorityChange If true, the item can shift up into a different priority.
   *  If false, it will only shift up within the same priority. Default is false.
   * @returns
   */
  shiftUp(item: T, allowPriorityChange = false) {
    const node = this.itemMap.get(item);
    if (!node || !node.prev) {
      return;
    }
    if (node.prev.priority !== node.priority) {
      if (!allowPriorityChange) {
        return;
      }
      const prevPriority = node.prev.priority;
      this.removeItem(item);
      this.addItem(item, prevPriority, "last");
      this.shiftUp(item, false);
      return;
    }
    this.swapNodes(node, node.prev);
  }

  /**
   * Shifts the item down (moves it to a later position in the list).
   * @param item
   * @param allowPriorityChange If true, the item can shift down into a different priority.
   *   If false, it will only shift down within the same priority and is effectively ignored. Default is false.   *
   * @returns
   */
  shiftDown(item: T, allowPriorityChange = false) {
    const node = this.itemMap.get(item);
    if (!node || !node.next) {
      return;
    }
    if (node.next.priority !== node.priority) {
      if (!allowPriorityChange) {
        return;
      }
      const nextPriority = node.next.priority;
      this.removeItem(item);
      this.addItem(item, nextPriority, "first");
      this.shiftDown(item, false);
      return;
    }
    this.swapNodes(node, node.next);
  }

  shiftItem(item: T, direction: "up" | "down", allowPriorityChange = false) {
    if (direction === "up") {
      this.shiftUp(item, allowPriorityChange);
    } else {
      this.shiftDown(item, allowPriorityChange);
    }
  }

  count() {
    return this.itemMap.size;
  }

  getItems() {
    return Array.from(this.itemMap.keys());
  }

  /**
   * Returns all items in the order they are in the priority list
   * @returns
   */
  getItemsInOrder() {
    const items: T[] = [];
    let current = this.head;
    while (current) {
      items.push(current.item);
      current = current.next;
    }
    return items;
  }

  getItemsInOrderWithPriority() {
    return this.map((item, info) => ({ item, info }));
  }

  getItemsInPriority(priority: number) {
    const items: T[] = [];
    let current = this.priorityNodeMap.get(priority);
    while (current) {
      items.push(current.item);
      if (!current.next || current.next.priority !== priority) {
        break;
      }
      current = current.next;
    }
    return items;
  }

  /**
   * Gets the first X items in the list
   * @param x The maximum number of items to return
   * @param filter An optional filter function to apply to each item. If the filter returns false, the item is not included in the result
   * and the count is not incremented
   * @returns
   */
  getFirstXItems(x: number, filter?: (item: T) => boolean) {
    const items: T[] = [];
    let current = this.head;
    let count = 0;
    while (current && count < x) {
      if (!filter || filter(current.item)) {
        items.push(current.item);
        count++;
      }
      current = current.next;
    }
    return items;
  }

  /**
   * Gets the items from the Xth item in the list
   * @param x The position in the list to start from
   * @param firstXFilter An optional filter function to apply to each item up to the Xth item.
   * If the filter returns false, the item is not counted towards the Xth item and the count is not incremented
   * @returns
   */
  getItemsFrom(x: number, firstXFilter?: (item: T) => boolean) {
    const items: T[] = [];
    let current = this.head;
    let count = 0;
    while (current && count < x) {
      if (!firstXFilter || firstXFilter(current.item)) {
        count++;
      }
      current = current.next;
    }
    if (!current) {
      return items;
    }
    while (current) {
      items.push(current.item);
      current = current.next;
    }
    return items;
  }

  /**
   * Gets the items from the Xth item in the list. If position exceeds
   * the number of items in the list, the last item is returned
   */
  private getNodeAtPosition(position: number) {
    let current = this.head;
    let count = 0;
    let priorityPosition = 0;
    while (current && count < position) {
      count++;
      if (!current.next || current.next.priority !== current.priority) {
        priorityPosition = 0;
      } else {
        priorityPosition++;
      }
      current = current.next;
    }
    return { node: current, position: count, priorityPosition };
  }

  /**
   * Inserts an item at the specified position in the list
   * @param item
   * @param desiredPosition
   * @param priorityHint If we're inserting at an absolute position we can't dictate the priority, but we
   * can provide a hint. If the priorityHint is provided, the item will match the closest priority to the hint
   * @returns
   */
  insertItemAtPosition(item: T, desiredPosition: number, priorityHint?: number) {
    const { node, priorityPosition } = this.getNodeAtPosition(desiredPosition);
    if (!node) {
      this.addItem(item, priorityHint || 1, "last");
      return;
    }
    const prevPriority = node.prev?.priority || node.priority;
    const currentItemPriority = node.priority;
    let priority = priorityHint || currentItemPriority;
    if (priorityHint) {
      const prevDiff = Math.abs(prevPriority - priorityHint);
      const nextDiff = Math.abs(currentItemPriority - priorityHint);
      priority = prevDiff < nextDiff ? prevPriority : currentItemPriority;
    }
    // If the previous item's priority is different to the next item's priority AND we've
    // matched the priority of the previous item, we need to insert at the end of the previous item's priority
    // Otherwise we just insert at the current position of the current item's priority
    const insertPriorityPosition =
      currentItemPriority !== prevPriority && priority === prevPriority ? "last" : priorityPosition;
    this.addItem(item, priority, insertPriorityPosition);
  }

  moveNodeToPosition(item: T, desiredPosition: number) {
    const node = this.itemMap.get(item);
    if (!node) {
      return;
    }
    this.removeItem(item);
    this.insertItemAtPosition(item, desiredPosition, node.priority);
  }

  getHead() {
    return this.head?.item;
  }

  getTail() {
    return this.tail?.item;
  }

  /**
   * Splits the list at the specified position, returning the items before and after the split
   * @param splitAt The position in the list to split at
   * @param firstFilter An optional filter function to apply to each item before the split.
   * If the filter returns false, the item is not included in the result and the count is not incremented
   * @param lastFilter An optional filter function to apply to each item after the split.
   * If the filter returns false, the item is not included in the result and the count is not incremented
   * @returns
   */
  getSplit(splitAt: number, firstFilter?: (item: T) => boolean, lastFilter?: (item: T) => boolean) {
    const first: T[] = [];
    const last: T[] = [];
    let current = this.head;
    let count = 0;
    while (current) {
      if (count < splitAt) {
        if (!firstFilter || firstFilter(current.item)) {
          first.push(current.item);
          count++;
        }
      } else {
        if (!lastFilter || lastFilter(current.item)) {
          last.push(current.item);
        }
      }
      current = current.next;
    }
    return { first, last, splitAt };
  }
}
