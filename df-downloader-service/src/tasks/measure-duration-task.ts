import { logger, secondsToHHMMSS } from "df-downloader-common";
import { serviceLocator } from "../services/service-locator.js";
import { taskify } from "../task-manager/utils.js";
import { probeMediaDurationSeconds } from "../utils/media-metadata.js";

/**
 * Measures a just-downloaded file and records that measurement as the
 * entry's duration.
 *
 * Digital Foundry's relaunched site doesn't publish a duration, so until
 * this runs the only figure available is YouTube's - which covers the
 * un-cut upload, sponsorship read and all, and so overstates the file by up
 * to a minute and a half. Treating that as the file's length is what
 * silently disabled the subtitle offset correction (see docs/ROADMAP.md's
 * Phase 3). Once the file exists locally its own duration is simply a fact,
 * so it replaces the estimate unconditionally.
 */
export const measureDownloadedDuration = async (contentKey: string, mediaFilePath: string) => {
  const durationSeconds = await probeMediaDurationSeconds(mediaFilePath).catch((e) => {
    logger.log("warn", `Failed to measure duration of ${mediaFilePath}: ${e}`);
    return null;
  });
  if (durationSeconds === null) {
    return { durationSeconds: null };
  }
  const db = serviceLocator.db;
  const entry = await db.getContentEntry(contentKey);
  if (!entry) {
    // Nothing to patch, but the measurement is still useful to the rest of
    // the pipeline.
    return { durationSeconds };
  }
  const { contentInfo } = entry;
  const duration = secondsToHHMMSS(Math.round(durationSeconds));
  // Every format is the same edit at a different encode, so one measurement
  // describes all of them - matching how the YouTube backfill fills these in.
  const mediaInfo = contentInfo.mediaInfo.map((mediaInfo) => ({
    ...mediaInfo,
    duration,
    durationSource: "measured" as const,
  }));
  const alreadyRecorded = contentInfo.mediaInfo.every(
    (existing, i) => existing.duration === mediaInfo[i].duration && existing.durationSource === "measured"
  );
  if (!alreadyRecorded) {
    logger.log("info", `Measured ${contentKey} at ${duration} from the downloaded file`);
    await db.setContentInfo({ ...contentInfo, mediaInfo });
  }
  return { durationSeconds };
};

export const MeasureDurationTask = taskify(measureDownloadedDuration, {
  taskType: "measure_duration",
});
