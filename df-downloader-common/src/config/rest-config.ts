import { z } from "zod";
import { xor } from "../utils/general.js";

export const HttpConfig = z.object({
  port: z.number().min(1).max(65535),
});
export type HttpConfig = z.infer<typeof HttpConfig>;

//TODO: Fill this in
export const HttpsConfig = z
  .object({
    port: z.number().min(1).max(65535),
    keyPath: z.string().optional(),
    certPath: z.string().optional(),
    caPath: z.string().optional(),
    requestCert: z.boolean().optional(),
    rejectUnauthorized: z.boolean().optional(),
  })
  .refine((data) => {
    const hasKeyAndCert = Boolean(data.keyPath && data.certPath);
    const hasCaBundle = Boolean(data.caPath);
    const hasCertOptions = Boolean(data.requestCert || data.rejectUnauthorized);
    const hasMandatoryOptions = hasKeyAndCert && hasCaBundle && hasCertOptions;

    return hasMandatoryOptions || (!hasKeyAndCert && !hasCaBundle && !hasCertOptions);
  });
export type HttpsConfig = z.infer<typeof HttpsConfig>;

export const RestApiConfig = z
  .object({
    http: HttpConfig.optional(),
    https: HttpsConfig.optional(),
    publicAddress: z.string().optional(),
  })
  .refine((data) => xor(data.http, data.https), "Must supply only one of HTTP or HTTPS");
export type RestApiConfig = z.infer<typeof RestApiConfig>;

export const RestApiConfigKey = "restApi";
