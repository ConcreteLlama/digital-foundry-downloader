import { audioFormats, MediaFormat, videoFormats } from "df-downloader-common";
import { OrderableListFormField } from "../general/ordered-list-form-field.component.tsx";
import { DfSettingsSectionForm } from "./df-settings-section-form.component.tsx";

export const MediaFormatsSettingsForm = () => {
    return (
        <DfSettingsSectionForm sectionName="mediaFormats" title="Media Formats">
            <MediaFormatsSettings />
        </DfSettingsSectionForm>
    );
};

const description = `This determines the priority order when automatically downloading items or triggering a download without specifying the media type. Items not in the list will be ignored. ` + 
    `Unknown is a catch-all for any media format that is not explicitly listed. Similarly, Video (Unknown) and Audio (Unknown) are catch-alls for video and audio formats respectively.`;

const MediaFormatsSettings = () => {
    return (
        <OrderableListFormField name="priorities" label="Media Format Priorities" possibleValues={MediaFormat.options}
            nonDraggableValues={["Unknown"]}
            minSize={1}
            transformListOrder={transformListOrder}
            description={description} />

    );
};

const transformListOrder = (list: MediaFormat[]) => {
    let unknownIndex = -1;
    let audioUnknownIndex = -1;
    let videoUnknownIndex = -1;
    let lastNonUnknownAudioIndex = -1;
    let lastNonUnknownVideoIndex = -1;
    list.forEach((mediaFormat, index) => {
        if (mediaFormat === "Unknown") {
            unknownIndex = index;
        } else if (mediaFormat === "Audio (Unknown)") {
            audioUnknownIndex = index;
        } else if (mediaFormat === "Video (Unknown)") {
            videoUnknownIndex = index;
        } else if (audioFormats.has(mediaFormat)) {
            lastNonUnknownAudioIndex = index;
        } else if (videoFormats.has(mediaFormat)) {
            lastNonUnknownVideoIndex = index;
        }
    });
    const videoUnknownNeedsMoving = videoUnknownIndex !== -1 && videoUnknownIndex < lastNonUnknownVideoIndex;
    const audioUnknownNeedsMoving = audioUnknownIndex !== -1 && audioUnknownIndex < lastNonUnknownAudioIndex;
    if (unknownIndex !== -1 && !videoUnknownNeedsMoving && !audioUnknownNeedsMoving) {
        const newList = (list.filter((mediaFormat) => mediaFormat !== "Unknown") as MediaFormat[]);
        newList.push("Unknown");
        return newList;
    } else if (videoUnknownNeedsMoving || audioUnknownNeedsMoving) {
        const newList = list.slice();
        if (videoUnknownNeedsMoving) {
            newList.splice(lastNonUnknownVideoIndex + 1, 0, "Video (Unknown)");
            newList.splice(videoUnknownIndex, 1);
        }
        if (audioUnknownNeedsMoving) {
            newList.splice(lastNonUnknownAudioIndex + 1, 0, "Audio (Unknown)");
            newList.splice(audioUnknownIndex, 1);
        }
        return newList;
    }
    return list;
}