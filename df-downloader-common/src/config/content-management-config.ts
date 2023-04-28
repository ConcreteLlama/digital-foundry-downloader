import { z } from "zod";

export const ContentManagementConfig = z.object({
  scanForExistingFiles: z.boolean().default(true),
  destinationDir: z.string().default("df_downloads"),
  workDir: z.string().default("work_dir"),
});
export type ContentManagementConfig = z.infer<typeof ContentManagementConfig>;
export const ContentManagementConfigKey = "contentManagement";
