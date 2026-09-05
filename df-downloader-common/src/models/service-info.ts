import { z } from "zod";

export const ServiceInfo = z.object({
  name: z.string(),
  version: z.string(),
  branch: z.string(),
  /*
   * Optional because the UI is served by whatever service it is talking to,
   * which on a partial upgrade may predate these - and a missing build
   * identity should render as "unknown", not fail to parse the whole
   * response.
   */
  commit: z.string().optional(),
  builtAt: z.string().optional(),
  isContainer: z.boolean(),
});
export type ServiceInfo = z.infer<typeof ServiceInfo>;
