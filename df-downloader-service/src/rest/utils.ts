import { makeErrorResponse, makeSuccessResponse } from "df-downloader-common";
import { Request, Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

export const sendError = (res: Response, message: string, code: number = 400, details?: any) => {
  return res.status(code).send(makeErrorResponse(message, code, details));
};

export const errorToResponse = (e: any, code: number = 500) => {
  if (e instanceof Error) {
    return makeErrorResponse(e.message, code);
  } else {
    return makeErrorResponse("Unknown error", 500);
  }
};

export const sendErrorAsResponse = (res: Response, e: any, code: number = 500) => {
  return res.status(code).send(errorToResponse(e, code));
};

export const sendResponse = (res: Response, data: any, code: number = 200) => {
  return res.status(code).send(makeSuccessResponse(data));
};

export const zodParseHttp = async <T extends z.ZodRawShape, R = void | Promise<void>>(
  schema: z.ZodObject<T>,
  req: Request,
  res: Response,
  handler: (data: z.infer<z.ZodObject<T>>) => R
) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const zodError = fromZodError(result.error);
    return sendError(res, zodError.toString(), 400, zodError.details);
  }
  return await handler(result.data);
};
