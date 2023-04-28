import { z, ZodTypeAny } from "zod";
//TODO: This seems messier than it should be
export const ErrorResponseError = z.object({
  message: z.string(),
  code: z.number(),
  details: z.any(),
});
export type ErrorResponseError = z.infer<typeof ErrorResponseError>;

export const errorSchema = z.object({
  success: z.literal(false),
  error: ErrorResponseError,
});
export type ErrorResponse = z.infer<typeof errorSchema>;

export const successSchema = z.object({
  success: z.literal(true),
  data: z.any(),
});
export type SuccessResponse = z.infer<typeof successSchema>;

export const parseResponseBody = <T extends ZodTypeAny>(
  responseBody: any,
  dataSchema: T
): {
  error?: ErrorResponseError;
  data?: z.infer<T>;
} => {
  const errorResult = errorSchema.safeParse(responseBody);
  if (errorResult.success) {
    return {
      error: errorResult.data.error,
    };
  }

  if (!responseBody.data) {
    throw new Error("No response data");
  }

  const successResult = dataSchema.safeParse(responseBody.data);
  if (successResult.success) {
    return {
      data: successResult.data,
    };
  }

  throw new Error("Invalid response format");
};

export const makeSuccessResponse = <T extends ZodTypeAny>(data: z.infer<T>): SuccessResponse => {
  return {
    success: true,
    data,
  };
};

export const makeErrorResponse = (message: string, code: number, details?: unknown): ErrorResponse => {
  return {
    success: false,
    error: {
      message,
      code,
      details,
    },
  };
};
