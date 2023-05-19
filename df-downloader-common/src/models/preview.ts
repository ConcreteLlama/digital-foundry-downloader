import { z } from "zod";

export const PreviewThumbnailResponse = z.object({
  thumnails: z.array(z.string()),
});
export type PreviewThumbnailResponse = z.infer<typeof PreviewThumbnailResponse>;
