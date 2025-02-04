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

export const PreviewMoveResponse = z.object({
    templateString: z.string(),
    results: z.array(z.object({
        contentName: z.string(),
        files: z.array(z.object({
            oldFilename: z.string(),
            newFilename: z.string(),
        }))
    }))
});
export type PreviewMoveResponse = z.infer<typeof PreviewMoveResponse>;