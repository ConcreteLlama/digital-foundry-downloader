import { DfContentInfo } from "df-downloader-common";
import { fetchYtChapters } from "../utils/youtube/chapters.js";
import { taskify } from "../task-manager/utils.js";

export const fetchChapters = async(contentInfo: DfContentInfo) => {
    const videoId = contentInfo.youtubeVideoId;
    if (!videoId) {
        return null;
    }
    const chapters = await fetchYtChapters(videoId);
    return chapters;
}

export const FetchChaptersTask = taskify(fetchChapters, {
    taskType: "fetch_chapters",
});