import { ZodNumber, z } from "zod";

export const undefinedInfinity = (arg: number | undefined | null) =>
  arg === undefined || arg === null ? Infinity : arg;
/** A zod transform that converts undefined to Infinity */
export const zUndefinedInfinity = (zNumber: ZodNumber) => {
  return zNumber.optional().transform(undefinedInfinity);
};
