import { DfContentInfo } from "df-downloader-common";
import { fetchYtVideoMeta } from "../utils/youtube/chapters.js";
import { taskify } from "../task-manager/utils.js";

export const fetchChapters = async(contentInfo: DfContentInfo) => {
    const videoId = contentInfo.youtubeVideoId;
    if (!videoId) {
        return null;
    }
    const meta = await fetchYtVideoMeta(videoId);
    return meta?.chapters ?? null;
}

export const FetchChaptersTask = taskify(fetchChapters, {
    taskType: "fetch_chapters",
});