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