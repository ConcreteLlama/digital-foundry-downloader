import { z } from "zod";
import { xor } from "../utils/general.js";

export const HttpConfig = z.object({
  port: z.number().min(1).max(65535).describe("The port the web interface and API are served on."),
});
export type HttpConfig = z.infer<typeof HttpConfig>;

//TODO: Fill this in
export const HttpsConfig = z
  .object({
    port: z.number().min(1).max(65535).describe("The port the web interface and API are served on over HTTPS."),
    keyPath: z
      .string()
      .optional()
      .describe("Path to the TLS private key file. Leave blank to have a self-signed certificate generated instead."),
    certPath: z.string().optional().describe("Path to the TLS certificate file that pairs with the private key."),
    caPath: z.string().optional().describe("Path to the CA bundle used to verify client certificates."),
    requestCert: z.boolean().optional().describe("Ask connecting clients for a certificate of their own."),
    rejectUnauthorized: z
      .boolean()
      .optional()
      .describe("Refuse clients whose certificate cannot be verified against the CA bundle."),
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
    publicAddress: z
      .string()
      .optional()
      .describe(
        "The address this installation is reachable at, used for the links in emails and notifications. Worked out automatically if left blank, which is usually right unless you are behind a reverse proxy."
      ),
    /** The allowed origins for CORS requests */
    allowOrigin: z
      .union([z.literal(REFLECT_REQUEST), z.string(), z.array(z.string())])
      .optional()
      .describe(
        "Which other origins a browser may call this API from. Only needed if you serve the interface from a different address to the API."
      ),
  })
  .refine((data) => xor(data.http, data.https), "Must supply only one of HTTP or HTTPS");
export type RestApiConfig = z.infer<typeof RestApiConfig>;

export const RestApiConfigKey = "restApi";

export const DefaultRestApiConfig: RestApiConfig = {
  http: {
    port: 44556,
  },
};
