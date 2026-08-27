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
  /**
   * Write the finished file straight to its destination instead of building
   * it in the work directory and then copying it across.
   *
   * Embedding metadata means remuxing the file with ffmpeg, which reads and
   * writes it end to end. Doing that in the work directory and *then* moving
   * the result means a multi-gigabyte file gets read twice and written twice
   * after the download. Pointing ffmpeg at the destination halves that -
   * particularly worth having when the destination is a parity-protected
   * array, where writes are the expensive part.
   *
   * This does not weaken the reason the work directory exists. Media servers
   * watch the destination and must never see a half-written file, so the
   * output is written under a temporary name *in the destination directory*
   * and then renamed - a same-filesystem rename is atomic, so the real
   * filename only ever appears complete. Downloads themselves still go to
   * the work directory; only the final assembly moves.
   *
   * The same applies when updating a file that's already in your library -
   * refreshing its metadata, or embedding subtitles into an existing
   * download. Those rebuild the file too, and doing it in the work directory
   * means copying the result back over the original, which both doubles the
   * I/O and overwrites the file in place for as long as that copy takes. With
   * this on, the replacement is a rename instead: instant, and anything
   * streaming the file sees either the old version or the new one rather than
   * a partially rewritten one.
   *
   * Turn it off to restore the previous behaviour if your setup dislikes it
   * (e.g. something in the destination reacts badly to the temporary file, or
   * you'd rather the rebuild happened on faster scratch storage and can
   * accept the copy back).
   *
   * Has no effect when there's nothing to embed - with metadata injection
   * off and no subtitles or chapters, there's no remux to redirect, so the
   * file is simply moved as before.
   */
  writeDirectToDestination: z.boolean().default(true),
});
export type ContentManagementConfig = z.infer<typeof ContentManagementConfig>;
export const ContentManagementConfigKey = "contentManagement";

export const ContainerContentManagementConfig = ContentManagementConfig.extend({
  /** The directory where downloaded files are stored */
  destinationDir: z.string().default("/destination_dir").transform(() => "/destination_dir"),
  /** The directory where temporary working files are stored (partial downloads etc) */
  workDir: z.string().default("/working_dir").transform(() => "/working_dir"),
});