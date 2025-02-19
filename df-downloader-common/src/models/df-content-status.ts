import { z } from "zod";

export enum DfContentAvailability {
  AVAILABLE = "AVAILABLE",
  PAYWALLED = "PAYWALLED",
  UNKNOWN = "UNKNOWN",
}

export const DfContentAvailabilityInfo = z.object({
  availability: z.nativeEnum(DfContentAvailability),
  availabilityInTiers: z.record(z.string(), z.nativeEnum(DfContentAvailability)),
});
export type DfContentAvailabilityInfo = z.infer<typeof DfContentAvailabilityInfo>;
