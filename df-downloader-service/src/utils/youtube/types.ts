export type YtInitialPlayerResponse = {
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: YtCaptionTrack[] } };
    videoDetails: YtVideoDetails;
    streamingData: YtStreamingData;
}

export type YtInitialData = {
    playerOverlays?: YtPlayerOverlays;
}

export type YtCaptionTrack = {
  baseUrl: string;
  name: { simpleText: string };
  vssId: string;
  languageCode: string;
  kind: string;
  isTranslatable: boolean;
  trackName: string;
};

export type YtThumbnail = {
    url: string;
    width: number;
    height: number;
};

export type YtVideoDetails = {
    videoId: string;
    title: string;
    lengthSeconds: string;
    channelId: string;
    isOwnerViewing: boolean;
    shortDescription: string;
    isCrawlable: boolean;
    thumbnail: {
        thumbnails: YtThumbnail[];
    };
    allowRatings: boolean;
    viewCount: string;
    author: string;
    isPrivate: boolean;
    isUnpluggedCorpus: boolean;
    isLiveContent: boolean;
};

export type YtFormat = {
    itag: number;
    url: string;
    mimeType: string;
    bitrate: number;
    width: number;
    height: number;
    lastModified: string;
    contentLength: string;
    quality: string;
    fps: number;
    qualityLabel: string;
    projectionType: string;
    averageBitrate: number;
    audioQuality?: string;
    approxDurationMs: string;
    audioSampleRate?: string;
    audioChannels?: number;
    initRange?: {
        start: string;
        end: string;
    };
    indexRange?: {
        start: string;
        end: string;
    };
    colorInfo?: {
        primaries: string;
        transferCharacteristics: string;
        matrixCoefficients: string;
    };
    loudnessDb?: number;
    highReplication?: boolean;
    isDrc?: boolean;
    xtags?: string;
};

export type YtStreamingData = {
    expiresInSeconds: string;
    formats: YtFormat[];
    adaptiveFormats: YtFormat[];
    serverAbrStreamingUrl: string;
};

export type YtChapterRenderer = {
    title: {
        simpleText: string;
    };
    timeRangeStartMillis: number;
    onActiveCommand: {
        clickTrackingParams: string;
        setActivePanelItemAction: {
            panelTargetId: string;
            itemIndex: number;
        };
    };
    thumbnail: {
        thumbnails: YtThumbnail[];
    };
};

export type YtChapter = {
    chapterRenderer?: YtChapterRenderer;
};

export type YtMarkerRenderer = {
    title?: Record<string, unknown>;
    timeRangeStartMillis?: number;
};

export type YtMarker = {
    markerRenderer?: YtMarkerRenderer;
};

export type YtMarkersMapValue = {
    markers?: YtMarker[];
    chapters?: YtChapter[];
    trackingParams?: string;
};

export type YtMarkersMap = {
    key?: string;
    value?: YtMarkersMapValue;
};

export type YtMultiMarkersPlayerBarRenderer = {
    visibleOnLoad?: {
        key?: string;
    };
    markersMap?: YtMarkersMap[];
};

export type YtPlayerBar = {
    multiMarkersPlayerBarRenderer?: YtMultiMarkersPlayerBarRenderer;
};

export type YtDecoratedPlayerBarRenderer = {
    decoratedPlayerBarRenderer?: {
        playerBar?: YtPlayerBar;
    };
};

export type YtPlayerOverlayVideoDetailsRenderer = {
    title?: {
        simpleText?: string;
    };
    subtitle?: {
        runs?: {
            text?: string;
        }[];
    };
};

export type YtPlayerOverlayRenderer = {
    videoDetails?: {
        playerOverlayVideoDetailsRenderer?: YtPlayerOverlayVideoDetailsRenderer;
    };
    decoratedPlayerBarRenderer?: YtDecoratedPlayerBarRenderer;
};

export type YtPlayerOverlays = {
    playerOverlayRenderer?: YtPlayerOverlayRenderer;
};