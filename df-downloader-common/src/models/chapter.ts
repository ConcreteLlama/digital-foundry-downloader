import { z } from "zod";

export const Chapter = z.object({
    title: z.string(),
    start: z.number(),
    end: z.number(),
});
export type Chapter = z.infer<typeof Chapter>;