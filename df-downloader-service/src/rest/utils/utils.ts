import { makeErrorResponse, makeSuccessResponse } from "df-downloader-common";
import os from "os";
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

export const handleRequest = (req: Request, res: Response, handler: () => Promise<any>) => {
  return handler()
    .then((data) => {
      if (res.headersSent) {
        logger.log("warn", "Response already sent");
        return;
      }
      return sendResponse(res, data);
    })
    .catch((e) => sendErrorAsResponse(res, e));
}

export const zodParseHttp = async <T extends z.ZodType<any, any, any>, R = void | Promise<void>>(
  schema: T,
  req: Request,
  res: Response,
  handler: (data: z.infer<T>) => R,
  dataSource: "body" | "params" | "query" = "body",
) => {
  const result = schema.safeParse(req[dataSource]);
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


const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const isLoopbackAddress = (address: string) => {
  try {
    return LOOPBACK_HOSTS.has(new URL(address).hostname);
  } catch {
    return false;
  }
};

/**
 * The first LAN-routable IPv4 this machine has, or undefined.
 *
 * Skips loopback and link-local (169.254.x.x, an address a machine gives
 * itself when DHCP failed - reachable by nothing).
 */
const firstLanIpv4 = (): string | undefined => {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }
      if (address.address.startsWith("169.254.")) {
        continue;
      }
      return address.address;
    }
  }
  return undefined;
};

/**
 * A base address another device on the network can actually reach us at.
 *
 * `getPublicAddresses()` falls back to 127.0.0.1/localhost when nothing is
 * configured, which is correct for its usual callers and useless here: a
 * cast receiver is a different machine, and a loopback address there means
 * the receiver itself, not this server. Handing one over produces a cast
 * that fails with nothing to explain why.
 *
 * So a configured address wins (someone stating their address is better
 * evidence than anything guessable), and otherwise this machine's own LAN
 * address is used. Returning undefined - no configured address and no
 * non-loopback interface - is reported to the user as something to fix in
 * settings rather than papered over with a URL known not to work.
 */
export const getLanReachableAddress = (): string | undefined => {
  const configured = getPublicAddresses().find((address) => !isLoopbackAddress(address));
  if (configured) {
    return configured;
  }
  const lanIp = firstLanIpv4();
  if (!lanIp) {
    return undefined;
  }
  const restConfig = configService.config.restApi;
  const protocol = restConfig.https ? "https" : "http";
  const port = restConfig.http ? restConfig.http.port : restConfig.https!.port;
  return `${protocol}://${lanIp}:${port}`;
};
