import { template } from "handlebars";
import { z } from "zod";

export const PreviewMoveRequest = z.object({
    templateString: z.string(),
    contentNames: z.union([z.literal('all'), z.array(z.string())]).transform((value) => {
        if (typeof value === 'string' && value.trim().toLowerCase() === 'all') {
            return 'all';
        }
        return value;
    }),
});
export type PreviewMoveRequest = z.infer<typeof PreviewMoveRequest>;

export const MoveFileInfo = z.object({
    oldFilename: z.string(),
    newFilename: z.string(),
});
export type MoveFileInfo = z.infer<typeof MoveFileInfo>;

export const ContentMoveFileInfo = MoveFileInfo.extend({
    contentName: z.string(),
    /**
     * Files that live beside the video and have to travel with it - subtitle
     * sidecars, today.
     *
     * Carried on the download's own entry rather than listed as moves in their
     * own right, because a sidecar is not a download: the content database is
     * keyed by download location, so a standalone entry for a .srt would find
     * no record to update and report a phantom failure.
     *
     * A .srt left behind is worse than untidy - a sidecar only works when it
     * sits next to its video, so the subtitles silently stop being found, and
     * the old directory can never be cleaned up because something is still in
     * it.
     */
    sidecars: z.array(MoveFileInfo).default([]),
});
export type ContentMoveFileInfo = z.infer<typeof ContentMoveFileInfo>;

export const PreviewMoveResponse = z.object({
    templateString: z.string(),
    results: z.array(ContentMoveFileInfo),
});
export type PreviewMoveResponse = z.infer<typeof PreviewMoveResponse>;

export const MoveFilesBaseRequest = z.object({
    removeRecordIfMissing: z.boolean().default(false),
    overwrite: z.boolean(),
});
export type MoveFilesBaseRequest = z.infer<typeof MoveFilesBaseRequest>;

export const MoveFilesWithListRequest = MoveFilesBaseRequest.extend({
    toMove: z.array(ContentMoveFileInfo),
});
export type MoveFilesWithListRequest = z.infer<typeof MoveFilesWithListRequest>;
export const isMoveFilesWithListRequest = (request: MoveFilesRequest): request is MoveFilesWithListRequest => {
    return (request as any).toMove !== undefined;
}

export const MoveFilesWithTemplateRequest = MoveFilesBaseRequest.extend({
    template: z.string(),
});
export type MoveFilesWithTemplateRequest = z.infer<typeof MoveFilesWithTemplateRequest>;
export const isMoveFilesWithTemplateRequest = (request: MoveFilesRequest): request is MoveFilesWithListRequest => {
    return (request as any).template !== undefined;
}

export const MoveFilesRequest = z.union([MoveFilesWithListRequest, MoveFilesWithTemplateRequest]);
export type MoveFilesRequest = z.infer<typeof MoveFilesRequest>;