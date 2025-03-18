import { z } from "zod";
import { MediaFileMeta } from "./media-file-meta.js";

export const DfContentUpdateDownloadMetaRequest = z.object({
    contentName: z.string(),
    filename: z.string(),
    meta: MediaFileMeta.optional(),
});
export type DfContentUpdateDownloadMetaRequest = z.infer<typeof DfContentUpdateDownloadMetaRequest>;

export const DfContentUpdateDownloadMetaResponse = z.object({
    contentName: z.string(),
    filename: z.string(),
    pipelineId: z.string(),
});
export type DfContentUpdateDownloadMetaResponse = z.infer<typeof DfContentUpdateDownloadMetaResponse>;