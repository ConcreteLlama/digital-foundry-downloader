import { DfContentInfo } from "df-downloader-common";
import { serviceLocator } from "../services/service-locator.js";
import { syncYtVideoMeta } from "../utils/youtube/sync-yt-video-meta.js";
import { taskify } from "../task-manager/utils.js";

export const fetchChapters = async(contentInfo: DfContentInfo) => {
    const videoId = contentInfo.youtubeVideoId;
    if (!videoId) {
        return { chapters: null, description: contentInfo.description };
    }
    // alwaysFetch: chapters are embedded fresh into every downloaded file
    // rather than persisted anywhere, so this needs a live YouTube fetch
    // regardless of whether description/duration happen to already be
    // cached (e.g. from an earlier dialog open or auto-download exclusion
    // check - see syncYtVideoMeta's doc comment). The description/duration
    // DB write itself is still skipped when there's nothing new to save.
    const result = await syncYtVideoMeta(serviceLocator.db, contentInfo.key, { alwaysFetch: true });
    return {
        chapters: result?.chapters ?? null,
        description: result?.entry.contentInfo.description ?? contentInfo.description,
    };
}

export const FetchChaptersTask = taskify(fetchChapters, {
    taskType: "fetch_chapters",
});
