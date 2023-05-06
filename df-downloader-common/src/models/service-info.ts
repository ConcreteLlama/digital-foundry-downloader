import { z } from "zod";

export const ServiceInfo = z.object({
  name: z.string(),
  version: z.string(),
  isContainer: z.boolean(),
});
export type ServiceInfo = z.infer<typeof ServiceInfo>;
