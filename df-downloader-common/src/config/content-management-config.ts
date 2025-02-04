import { z } from "zod";
import { DfFilenameTemplateVar, testTemplate } from "../utils/filename-template-utils.js";
import { makeErrorMessage } from "../utils/general.js";
import { DummyContentInfos } from "../models/df-content-info.js";

export const ContentManagementConfig = z.object({
  /** The pattern to use for the output filename */
  filenameTemplate: z.string().default(`{{${DfFilenameTemplateVar.CONTENT_URL_NAME}}}.{{${DfFilenameTemplateVar.EXTENSION}}}`).superRefine((val, ctx) => {
    try {
      testTemplate(val, DummyContentInfos[0]);
    } catch (e) {
      return ctx.addIssue({ code: z.ZodIssueCode.custom, message: makeErrorMessage(e) });
    }
  }),
  /** If set, the service will scan the destination directory for existing files and add them to the database as downloaded */
  scanForExistingFiles: z.boolean().default(true),
  /** Maximum depth to scan for files in the destination directory */
  maxScanDepth: z.number().min(0).default(3),
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