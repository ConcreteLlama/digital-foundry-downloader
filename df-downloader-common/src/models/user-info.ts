import { z } from "zod";

export const UserInfo = z.object({
  username: z.string(),
  tier: z.string(),
  avatarUrl: z.string().optional(),
});
export type UserInfo = z.infer<typeof UserInfo>;
