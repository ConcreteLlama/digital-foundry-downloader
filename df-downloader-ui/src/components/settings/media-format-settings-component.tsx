import { Alert, Snackbar, Stack, Typography } from "@mui/material";
import { describeFormatMatcher, MediaFormat, MediaFormatMatchers, sortFormatMatchers } from "df-downloader-common";
import _ from "lodash";
import { useState } from "react";
import { OrderableListFormField } from "../general/ordered-list-form-field.component.tsx";
import { DfSettingsSectionForm } from "./df-settings-section-form.component.tsx";

export const MediaFormatsSettingsForm = () => {
    return (
        <DfSettingsSectionForm sectionName="mediaFormats" title="Media Formats">
            <MediaFormatsSettings />
        </DfSettingsSectionForm>
    );
};

const MediaFormatsSettings = () => {
    const [movedItems, setMovedItems] = useState<boolean>(false);
    // If moved items trigger a snackbar, this will be useful
    const closeSnackbar = () => {
        setMovedItems(false);
    };
    const Description = (
        <Stack spacing={2} padding={2}>
            <Typography variant="body2">
                This determines the priority order when automatically downloading items or triggering a download without specifying the media type.
            </Typography>
            <Typography variant="body2">
                Items not in the list will be ignored. <strong>Any</strong> will match anything, <strong>Video</strong> will match any video regardless of format, <strong>HEVC</strong> will match HEVC at any resolution, etc.
            </Typography>
            <Typography variant="body2">
                Items that are a subset of another item (for example, <strong>HEVC</strong> is a subset of <strong>HEVC (4K)</strong>, will automatically be moved below the last item it's a subset of.
            </Typography>
            <Typography variant="body2">
                Example:
            </Typography>
            <Typography variant="body2" component="div" sx={{ fontFamily: 'monospace', padding: 1, borderRadius: 1 }}>
                Video, HEVC (4K), HEVC, HEVC (1080p)
            </Typography>
            <Typography variant="body2">
                will automatically be rearranged to:
            </Typography>
            <Typography variant="body2" component="div" sx={{ fontFamily: 'monospace', padding: 1, borderRadius: 1 }}>
                HEVC (4K), HEVC (1080p), HEVC, Video
            </Typography>
        </Stack>
    );

    return (
        <>
            <OrderableListFormField name="priorities" label="Media Format Priorities" possibleValues={MediaFormat.options.map((item) => ({
                value: item,
                description: describeFormatMatcher(MediaFormatMatchers[item])
            }))}
                nonDraggableValues={["Any"]}
                minSize={1}
                transformListOrder={(oldValue, newValue) => {
                    const sorted = sortFormatMatchers(newValue);
                    if (oldValue?.length === newValue?.length) {
                        setMovedItems(!_.isEqual(sorted, newValue));
                    }
                    return sorted;
                }}
                description={Description} />
            <Snackbar
                open={movedItems}
                autoHideDuration={5000}
                onClose={closeSnackbar}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            ><Alert
                onClose={closeSnackbar}
                severity="info"
                variant="filled"
                sx={{ width: '100%' }}
            >
                    Some items were automatically rearranged due to matching criteria being a subset of another item.
                </Alert></Snackbar>
        </>

    );
};