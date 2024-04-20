import { EventEmitter } from "events";

type EventMap = Record<string, any>;

export class TypedEventEmitter<Events extends EventMap> {
  private emitter = new EventEmitter();

  emit<K extends keyof Events>(event: K, arg: Events[K]): boolean {
    return this.emitter.emit(event.toString(), arg);
  }

  on<K extends keyof Events>(event: K, listener: (arg: Events[K]) => void): this {
    this.emitter.on(event.toString(), listener);
    return this;
  }

  once<K extends keyof Events>(event: K, listener: (arg: Events[K]) => void): this {
    this.emitter.once(event.toString(), listener);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: (arg: Events[K]) => void): this {
    this.emitter.off(event.toString(), listener);
    return this;
  }

  removeAllListeners<K extends keyof Events>(event?: K): this {
    if (event !== undefined) {
      this.emitter.removeAllListeners(event.toString());
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }
}
export type TypedEventEmitterType<Events extends EventMap> = TypedEventEmitter<Events>;

type CachedEventEmitterOpts = {
  cacheSize?: number | null;
};

export class CachedEventEmitter<Events extends EventMap> extends TypedEventEmitter<Events> {
  private cache: {
    [K in keyof Events]?: Events[K][];
  } = {};

  private cacheSize: number | null;

  constructor(opts: CachedEventEmitterOpts = {}) {
    super();
    this.cacheSize = opts.cacheSize || null;
  }

  emit<K extends keyof Events>(event: K, arg: Events[K]): boolean {
    const eventCache = (this.cache[event] = this.cache[event] || []);
    eventCache.push(arg);
    if (this.cacheSize !== null && eventCache.length > this.cacheSize) {
      eventCache.splice(0, eventCache.length - this.cacheSize);
    }
    return super.emit(event, arg);
  }

  private replayTo<K extends keyof Events, EVENT = Events[K]>(eventName: K, listener: (arg: EVENT) => void) {
    const cache = this.cache[eventName];
    cache?.forEach((arg) => listener(arg));
    return cache?.length || 0;
  }

  on<K extends keyof Events, EVENT = Events[K]>(event: K, listener: (arg: EVENT) => void): this {
    super.on(event, listener);
    this.replayTo(event, listener);
    return this;
  }

  once<K extends keyof Events, EVENT = Events[K]>(event: K, listener: (arg: EVENT) => void): this {
    if (this.replayTo(event, listener) === 0) {
      super.once(event, listener);
    }
    return this;
  }
}
