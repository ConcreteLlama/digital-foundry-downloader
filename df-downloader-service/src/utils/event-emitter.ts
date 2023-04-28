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
