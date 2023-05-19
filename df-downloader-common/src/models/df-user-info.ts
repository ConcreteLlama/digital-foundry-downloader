import { z } from "zod";

export const DfUserInfo = z.object({
  username: z.string(),
  tier: z.string(),
  avatarUrl: z.string().optional(),
});
export type DfUserInfo = z.infer<typeof DfUserInfo>;
