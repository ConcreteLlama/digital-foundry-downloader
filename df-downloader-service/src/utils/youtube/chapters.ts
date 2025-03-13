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

export const fetchYtChapters = async (videoId: string): Promise<Chapter[] | null> => {
    const ytPageDom = await fetchYtVideoPageDom(videoId);
    const initialData = getInitialData(ytPageDom);
    if (!initialData) {
        return null;
    }
    const initialPlayerResponse = getInitialPlayerResponse(ytPageDom);
    if (!initialPlayerResponse) {
        return null;
    }
    const chapters = getChapterInfo(initialData);
    if (!chapters) {
        return null;
    }
    return ytChaptersToChapters(chapters, parseInt(initialPlayerResponse.videoDetails.lengthSeconds) * 1000);
}