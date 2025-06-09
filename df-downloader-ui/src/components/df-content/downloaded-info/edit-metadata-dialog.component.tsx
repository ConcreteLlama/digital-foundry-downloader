import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from "@mui/material";
import { DfContentDownloadInfo, DfContentEntry, MediaFileMeta } from "df-downloader-common";
import { useEffect, useRef } from "react";
import { FormContainer, TextFieldElement } from "react-hook-form-mui";
import { getMediaFileMeta, updateMediaFileMeta } from "../../../api/content.ts";
import { useQuery } from "../../../hooks/use-query.ts";
import { DfTagField } from "../../form-fields/df-tag-field.component.tsx";
import { Loading } from "../../general/loading.component.tsx";
import _ from "lodash";

type EditMetadataDialogProps = {
    open: boolean;
    onClose: () => void;
    contentEntry: DfContentEntry;
    download: DfContentDownloadInfo;
};

export const EditMetadataDialog = (props: EditMetadataDialogProps) => {
    const { open, onClose, contentEntry, download } = props;
    const { data: mediaFileMeta, loading, error, refetch } = useQuery({
        fetch: () => getMediaFileMeta({
            contentName: contentEntry.name, 
            mediaFilename: download.downloadLocation,
        }),
        triggerOnMount: false,
    });
    useEffect(() => {
        if (open) {
            refetch();
        }
    }, [open]);
    const submitMetadata = async (metadata: MediaFileMeta) => {
        if (_.isEqual(metadata.subtitles, mediaFileMeta?.subtitles)) {
            delete metadata.subtitles;
        }
        updateMediaFileMeta(contentEntry.name, download.downloadLocation, metadata);
        onClose();
    }
    const buttonRef = useRef<HTMLButtonElement>(null);
    const submit = () => {
        buttonRef.current?.click();
    }
    return <Dialog open={open} onClose={onClose} fullWidth>
        <DialogTitle>Edit Metadata</DialogTitle>
        <DialogContent>
            {mediaFileMeta ?
                <FormContainer onSuccess={submitMetadata} defaultValues={mediaFileMeta}>
                    <Stack sx={{ gap: 2, paddingTop: 2 }}>
                        <TextFieldElement name="title" label="Title" />
                        <TextFieldElement name="description" label="Description" multiline />
                        <DfTagField name="tags" label="Tags" />
                        <button type="submit" hidden id="submit-meta" ref={buttonRef} />
                    </Stack>
                </FormContainer>
                : loading ?
                    <Loading />
                    : error ?
                        <div>{error}</div>
                        : 'No metadata loaded'}
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" onClick={submit}>Save</Button>
        </DialogActions>
    </Dialog>;
}