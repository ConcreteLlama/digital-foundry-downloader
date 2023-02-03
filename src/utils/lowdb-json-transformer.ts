import { ClassConstructor, instanceToPlain, plainToInstance } from "class-transformer";
import { JSONFile } from "lowdb";

export class LowDbJsonTransformer<T> extends JSONFile<T> {
  constructor(filename: string, readonly dataType: ClassConstructor<T>) {
    super(filename);
  }
  async read(): Promise<T | null> {
    const plainData = super.read();
    const transformed = await plainToInstance(this.dataType, plainData);
    return transformed;
  }
  async write(obj: T): Promise<void> {
    const plainData = instanceToPlain(obj) as any;
    return super.write(plainData);
  }
}
