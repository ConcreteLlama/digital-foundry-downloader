import { logger } from "./logger.js";

type ExpriyCacheEntry<T> = {
  expiryTime: number;
  value: T;
};

type NextExpiry = {
  expiryTime: number;
  timeout: ReturnType<typeof setTimeout>;
};

export class ExpiryCache<T> {
  cache: Map<string, ExpriyCacheEntry<T>> = new Map();
  nextExpiryCheck?: NextExpiry;
  constructor() {}
  get(key: string) {
    return this.getEntry(key)?.value;
  }
  getEntry(key: string) {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiryTime < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry;
  }
  has(key: string) {
    return Boolean(this.get(key));
  }
  delete(key: string) {
    this.cache.delete(key);
  }
  private getNextExpiringItem() {
    let nextExpiringItem: ExpriyCacheEntry<T> | undefined;
    for (const [key, entry] of this.cache.entries()) {
      if (!nextExpiringItem || entry.expiryTime < nextExpiringItem.expiryTime) {
        nextExpiringItem = entry;
      }
    }
    return nextExpiringItem;
  }
  private setNextPurgeTimeout(nextExpiringItem: ExpriyCacheEntry<T> | undefined) {
    if (nextExpiringItem) {
      this.nextExpiryCheck = {
        expiryTime: nextExpiringItem.expiryTime,
        timeout: setTimeout(() => {
          this.purgeExpiredItems();
        }, nextExpiringItem.expiryTime - Date.now()),
      };
    }
  }
  private purgeExpiredItems() {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiryTime < Date.now()) {
        logger.log("info", new Date(), "Purging expired item", key);
        this.cache.delete(key);
      }
    }
    this.setNextPurgeTimeout(this.getNextExpiringItem());
  }
  private set(key: string, entry: ExpriyCacheEntry<T>) {
    this.cache.set(key, entry);
    if (!this.nextExpiryCheck || entry.expiryTime < this.nextExpiryCheck.expiryTime) {
      if (this.nextExpiryCheck) {
        clearTimeout(this.nextExpiryCheck.timeout);
      }
      this.setNextPurgeTimeout(entry);
    }
  }
  setExpireIn(key: string, value: T, ttl: number) {
    const expiryTime = Date.now() + ttl;
    this.set(key, {
      expiryTime: Date.now() + ttl,
      value,
    });
    return expiryTime;
  }
  setExpireAt(key: string, value: T, expiryTime: number) {
    this.set(key, {
      expiryTime,
      value,
    });
  }
}
