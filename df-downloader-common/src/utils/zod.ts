import { ZodObject, ZodRawShape, ZodType, z } from "zod";
import { fromZodError, isValidationError, isValidationErrorLike } from "zod-validation-error";

export const zodParse = <T extends ZodObject<any>>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(fromZodError(result.error).toString());
  }
};
