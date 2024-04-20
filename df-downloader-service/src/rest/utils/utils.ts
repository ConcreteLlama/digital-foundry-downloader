import { makeErrorResponse, makeSuccessResponse } from "df-downloader-common";
import { CookieOptions, Request, Response } from "express";
import { OutgoingHttpHeaders } from "http";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { configService } from "../../config/config.js";
import { logger } from "df-downloader-common";
import { REFLECT_REQUEST } from "df-downloader-common/config/rest-config.js";

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
export type CookieOpts = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export type ResponseOptions = {
  code: number;
  headers?: OutgoingHttpHeaders;
  cookies?: CookieOpts[];
};
const ensureResponseOptions = (opts: Partial<ResponseOptions>, defaultCode: number) => ({
  ...opts,
  code: opts.code || defaultCode,
});

export const sendResponseWithData = (res: Response, data: any, opts: ResponseOptions) => {
  if (opts.headers) {
    res.set(opts.headers);
  }
  if (opts.cookies) {
    opts.cookies.forEach((c) => res.cookie(c.name, c.value, c.options || {}));
  }
  return res.status(opts.code).send(data);
};

export const sendErrorAsResponse = (res: Response, e: any, opts: Partial<ResponseOptions> = {}) => {
  const optsActual = ensureResponseOptions(opts, 500);
  return sendResponseWithData(res, errorToResponse(e, optsActual.code), optsActual);
};

export const sendResponse = (res: Response, data: any, opts: Partial<ResponseOptions> = {}) => {
  return sendResponseWithData(res, makeSuccessResponse(data), ensureResponseOptions(opts, 200));
};

export const zodParseHttp = async <T extends z.ZodRawShape, R = void | Promise<void>>(
  schema: z.ZodObject<T> | z.ZodEffects<z.ZodObject<T>>,
  req: Request,
  res: Response,
  handler: (data: z.infer<z.ZodObject<T>>) => R
) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const zodError = fromZodError(result.error);
    logger.log("error", "Error parsing response from", req.baseUrl, zodError.toString());
    return sendError(res, zodError.toString(), 400, zodError.details);
  }
  return await handler(result.data);
};

export const isRestSecure = () => {
  return Boolean(configService.config.restApi.https);
};

export const getPublicAddresses = () => {
  const restConfig = configService.config.restApi;

  const envAddress = process.env.PUBLIC_ADDRESS;
  if (envAddress) {
    logger.log("info", `Using public address ${envAddress} from env`);
    return [envAddress];
  } else if (restConfig.publicAddress) {
    logger.log("info", `Using public address ${restConfig.publicAddress} from config`);
    return [restConfig.publicAddress];
  } else {
    const protcol = restConfig.https ? "https" : "http";
    const port = restConfig.http ? restConfig.http.port : restConfig.https!.port;
    const publicAddresses = [`${protcol}://127.0.0.1:${port}`, `${protcol}://localhost:${port}`];
    logger.log("info", `Using auto generated public address ${publicAddresses}`);
    return publicAddresses;
  }
};

export const getAllowOrigin = (defaultVal: string | string[] = "") => {
  const restConfig = configService.config.restApi;

  const envAllowOrigin = process.env.ALLOW_ORIGIN;
  if (envAllowOrigin) {
    logger.log("info", `Using allow origin ${envAllowOrigin} from env`);
    return envAllowOrigin === REFLECT_REQUEST
      ? true
      : envAllowOrigin.includes(",")
      ? envAllowOrigin.split(",").map((value) => value.trim())
      : envAllowOrigin;
  } else if (restConfig.allowOrigin) {
    logger.log("info", `Using allow origin ${restConfig.allowOrigin} from config`);
    return restConfig.allowOrigin === REFLECT_REQUEST ? true : restConfig.allowOrigin;
  }
  logger.log("info", `Using default allow origin ${defaultVal}`);
  return defaultVal;
};

export const generateCorsAllow = (allowOrigin: string | string[] | boolean) =>
  allowOrigin === true ? true : allowOrigin;
