import { AudioProperties } from "./audio-properties.js";
import { MediaEncoding } from "./media-encoding.js";
import { MediaType } from "./media-info.js";
import { VideoProperties, VideoPropertiesMatcher, describeVideoPropertiesMatcher, videoPropertiesMatch } from "./video-properties.js";

export type MediaFormatMatcher = {
    type?: MediaType;
    encoding?: MediaEncoding;
    videoProperties?: VideoPropertiesMatcher;
}

export type MediaInfoMatchesParams = {
    type: MediaType;
    encoding: MediaEncoding;
    videoProperties: VideoProperties | null;
    audioProperties: AudioProperties | null;
}
export const mediaInfoMatches = (mediaInfo: MediaInfoMatchesParams, matcher: MediaFormatMatcher) => {
    if (matcher.type && mediaInfo.type !== matcher.type) {
        return false;
    }
    if (matcher.encoding && mediaInfo.encoding !== matcher.encoding) {
        return false;
    }
    if (matcher.videoProperties && mediaInfo.videoProperties && !videoPropertiesMatch(mediaInfo.videoProperties, matcher.videoProperties)) {
        return false;
    }
    return true;
}
        
export const describeFormatMatcher = (formatMatcher: MediaFormatMatcher) => {
    const infos: string[] = [];
    if (formatMatcher.type) {
        infos.push(formatMatcher.type);
    }
    if (formatMatcher.encoding) {
        infos.push(formatMatcher.encoding);
    }
    if (formatMatcher.videoProperties) {
        infos.push(describeVideoPropertiesMatcher(formatMatcher.videoProperties));
    }
    return infos.join(", ");
}