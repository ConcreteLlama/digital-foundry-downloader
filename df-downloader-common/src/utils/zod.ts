import { ZodObject, ZodRawShape, ZodType, z } from "zod";
import { fromZodError, isValidationError, isValidationErrorLike } from "zod-validation-error";
import semver from "semver";

export const zodParse = <T extends ZodObject<any>>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  } else {
    throw new Error(fromZodError(result.error).toString());
  }
};

export const ZSemVer = z.string().superRefine((data) => {
  if (!semver.valid(data)) {
    throw new Error(`Invalid semver version: ${data}`);
  }
  return true;
});
export type ZSemVer = z.infer<typeof ZSemVer>;