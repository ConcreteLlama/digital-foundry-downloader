import * as z from "zod";
import { Chapter } from "./chapter.js";
import { SubtitleInfo } from "./subtitles.js";

export const MediaFileMeta = z.object({
    title: z.string().optional(),
    publishedDate: z.date().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    subtitles: SubtitleInfo.optional().nullable(),
    chapters: z.array(Chapter).optional().nullable(),
});
export type MediaFileMeta = z.infer<typeof MediaFileMeta>;

export const GetMediaFileMetaRequest = z.object({
    contentName: z.string(),
    mediaFilename: z.string(),
    includeSubs: z.coerce.boolean().default(false).optional(),
    includeChapters: z.coerce.boolean().default(false).optional(),
});
export type GetMediaFileMetaRequest = z.infer<typeof GetMediaFileMetaRequest>;