import { writeSubtitleSidecar } from "../media-utils/subtitles/sidecar.js";
import { GeneratedSubtitleInfo } from "../media-utils/subtitles/subtitles.js";
import { serviceLocator } from "../services/service-locator.js";
import { taskify } from "../task-manager/utils.js";

/*
 * Wrapped rather than passed straight to taskify so a media server can be
 * told about the new .srt. A sidecar appearing beside a video is a change
 * Plex and Jellyfin care about - it is how a subtitle track shows up at all -
 * but it does not touch the video file, so nothing else would announce it.
 */
export const WriteSubtitlesSidecarTask = taskify(
  async (videoPath: string, subtitles: GeneratedSubtitleInfo) => {
    const sidecarPath = await writeSubtitleSidecar(videoPath, subtitles);
    serviceLocator.mediaServers.fileChanged(sidecarPath, "subtitles");
    return sidecarPath;
  },
  {
    taskType: "write_subtitles_sidecar",
    idPrefix: "writeSubtitleSidecar",
  }
);
export type WriteSubtitlesSidecarTask = ReturnType<typeof WriteSubtitlesSidecarTask>;
