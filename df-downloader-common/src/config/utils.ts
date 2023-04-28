import { ZodNumber, z } from "zod";

export const undefinedInfinity = (arg: number | undefined) => (arg === undefined ? Infinity : arg);
export const zUndefinedInfinity = (zNumber: ZodNumber) => {
  return zNumber.optional().transform(undefinedInfinity);
};
