import { z } from "zod";

export const TestTemplateRequest = z.object({
    templateString: z.string(),
    contentNames: z.union([z.literal('all'), z.array(z.string())]).transform((value) => {
        if (typeof value === 'string' && value.trim().toLowerCase() === 'all') {
            return 'all';
        }
        return value;
    }),
});
export type TestTemplateRequest = z.infer<typeof TestTemplateRequest>;

export const TestTemplateResponse = z.object({
    templateString: z.string(),
    results: z.array(z.object({
        contentName: z.string(),
        files: z.array(z.object({
            oldFilename: z.string(),
            newFilename: z.string(),
        }))
    }))
});
export type TestTemplateResponse = z.infer<typeof TestTemplateResponse>;