import { Chapter } from "./chapter.js";
import { SrtLine, SubtitleInfo } from "./subtitles.js";
import * as z from "zod";

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
    includeSubs: z.coerce.boolean().optional().default(false),
    includeChapters: z.coerce.boolean().optional().default(false),
});
export type GetMediaFileMetaRequest = z.infer<typeof GetMediaFileMetaRequest>;