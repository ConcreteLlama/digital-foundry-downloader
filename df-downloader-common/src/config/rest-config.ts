import { z } from "zod";
import { xor } from "../utils/general.js";

export const HttpConfig = z.object({
  port: z.number().min(1).max(65535),
});
export type HttpConfig = z.infer<typeof HttpConfig>;

//TODO: Fill this in
export const HttpsConfig = z
  .object({
    /** The port to listen on */
    port: z.number().min(1).max(65535),
    /** The path to the key file */
    keyPath: z.string().optional(),
    /** The path to the certificate file */
    certPath: z.string().optional(),
    /** The path to the CA bundle file */
    caPath: z.string().optional(),
    /** Whether to request a certificate from the client */
    requestCert: z.boolean().optional(),
    /** Whether to reject unauthorized certificates */
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

export const REFLECT_REQUEST = "REFLECT_REQUEST";
export const RestApiConfig = z
  .object({
    /** The HTTP configuration (insecure) */
    http: HttpConfig.optional(),
    /** The HTTPS configuration (secure) */
    https: HttpsConfig.optional(),
    /** The public address of the server */
    publicAddress: z.string().optional(),
    /** The allowed origins for CORS requests */
    allowOrigin: z.union([z.literal(REFLECT_REQUEST), z.string(), z.array(z.string())]).optional(),
  })
  .refine((data) => xor(data.http, data.https), "Must supply only one of HTTP or HTTPS");
export type RestApiConfig = z.infer<typeof RestApiConfig>;

export const RestApiConfigKey = "restApi";

export const DefaultRestApiConfig: RestApiConfig = {
  http: {
    port: 44556,
  },
};
