import { z } from "zod";

export enum DfContentStatus {
  AVAILABLE = "AVAILABLE",
  PAYWALLED = "PAYWALLED",
}

export const DfContentStatusInfo = z.object({
  status: z.nativeEnum(DfContentStatus),
  userTierWhenUnavailable: z.string().optional(),
});
export type DfContentStatusInfo = z.infer<typeof DfContentStatusInfo>;
