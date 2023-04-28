import { ZodObject, z } from "zod";
import { fromZodError } from "zod-validation-error";

export const zodParse = <T extends ZodObject<any>>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(fromZodError(result.error).toString());
  }
};

export const zodCoerceArray = <T>(schema: z.ZodType<T>) => {
  return z.union([schema, z.array(schema)]).transform((value) => (Array.isArray(value) ? value : [value]));
};
