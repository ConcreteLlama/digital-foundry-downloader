import { z } from "zod";

export const DfTagInfo = z.object({
  tag: z.string(),
  count: z.number(),
});
export type DfTagInfo = z.infer<typeof DfTagInfo>;

export const DfTagsResponse = z.object({
  tags: z.array(DfTagInfo),
});
export type DfTagsResponse = z.infer<typeof DfTagsResponse>;
