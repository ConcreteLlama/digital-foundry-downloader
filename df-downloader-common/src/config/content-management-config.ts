import { z } from "zod";

export const ContentManagementConfig = z.object({
  /** If set, the service will scan the destination directory for existing files and add them to the database as downloaded */
  scanForExistingFiles: z.boolean().default(true),
  /** The directory where downloaded files are stored */
  destinationDir: z.string().default("df_downloads"),
  /** The directory where temporary working files are stored (partial downloads etc) */
  workDir: z.string().default("work_dir"),
});
export type ContentManagementConfig = z.infer<typeof ContentManagementConfig>;
export const ContentManagementConfigKey = "contentManagement";

export const ContainerContentManagementConfig = ContentManagementConfig.extend({
  /** The directory where downloaded files are stored */
  destinationDir: z.string().default("/destination_dir").transform(() => "/destination_dir"),
  /** The directory where temporary working files are stored (partial downloads etc) */
  workDir: z.string().default("/working_dir").transform(() => "/working_dir"),
});