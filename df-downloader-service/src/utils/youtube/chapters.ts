import { mapFilterEmpty } from "df-downloader-common";
import { Chapter } from "../chatpers.js";
import { YtChapterRenderer, YtInitialData } from "./types.js";
import { fetchYtVideoPageDom, getInitialData, getInitialPlayerResponse } from "./youtube-utils.js";

const getChapterInfo = (initialData: YtInitialData) => mapFilterEmpty(initialData.playerOverlays?.playerOverlayRenderer?.
    decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar?.
    multiMarkersPlayerBarRenderer?.markersMap?.find((marker) => marker.key === 'DESCRIPTION_CHAPTERS')?.value?.chapters || [], 
            (chapter) => chapter.chapterRenderer);


const ytChaptersToChapters = (ytChapters: YtChapterRenderer[], videoDurationMs: number): Chapter[] => {
    return ytChapters.map((ytChapter, index) => {
        const nextChapter = ytChapters[index + 1];
        return {
            title: ytChapter.title.simpleText,
            start: ytChapter.timeRangeStartMillis,
            end: nextChapter ? nextChapter.timeRangeStartMillis : videoDurationMs
        };
    });
}

export type YtVideoMeta = {
    chapters: Chapter[] | null;
    durationSeconds: number | null;
    description: string | null;
};

/**
 * Single fetch of the YouTube watch page, parsed for everything this tool
 * wants from it (chapters, duration, description) - both ytInitialData
 * (chapters) and ytInitialPlayerResponse (duration/description) are
 * embedded in the same page load, so this is genuinely one HTTP request no
 * matter how many of the three fields a given caller actually needs.
 */
export const fetchYtVideoMeta = async (videoId: string): Promise<YtVideoMeta | null> => {
    const ytPageDom = await fetchYtVideoPageDom(videoId);
    const initialPlayerResponse = getInitialPlayerResponse(ytPageDom);
    if (!initialPlayerResponse) {
        return null;
    }
    const parsedDurationSeconds = parseInt(initialPlayerResponse.videoDetails.lengthSeconds);
    const durationSeconds = isNaN(parsedDurationSeconds) ? null : parsedDurationSeconds;
    const description = initialPlayerResponse.videoDetails.shortDescription || null;
    const initialData = getInitialData(ytPageDom);
    const ytChapters = initialData ? getChapterInfo(initialData) : null;
    const chapters =
        ytChapters && durationSeconds !== null ? ytChaptersToChapters(ytChapters, durationSeconds * 1000) : null;
    return { chapters, durationSeconds, description };
}