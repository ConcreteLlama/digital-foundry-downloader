import { z } from "zod";

export const TestSessionIdRequest = z.object({
  sessionId: z.string(),
});
export type TestSessionIdRequest = z.infer<typeof TestSessionIdRequest>;
