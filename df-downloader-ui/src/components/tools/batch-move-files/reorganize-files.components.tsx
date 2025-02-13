import { Box, BoxProps, Button, ButtonGroup, ButtonProps, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Paper, styled, Typography, useMediaQuery } from "@mui/material";
import { ContentMoveFileInfo } from "df-downloader-common";
import { useState } from "react";
import { theme } from "../../../themes/theme.ts";
import { ColumnInfo, GridCell, GridContainer, GridRow, GridTable, GridTextCell } from "../../general/grid-table.tsx";

export const makeRecordKey = (info: ContentMoveFileInfo) => `${info.contentName}:${info.oldFilename}:${info.newFilename}`;

type MovableItemProps = {
    info: ContentMoveFileInfo;
    selected: boolean;
    onSelect: (info: ContentMoveFileInfo) => void;
    onDeselect: (info: ContentMoveFileInfo) => void;
    allowSelection: boolean;
}
const MovableItem = (props: MovableItemProps) => {
    return (
        <GridRow key={makeRecordKey(props.info)} sx={{
            alignItems: "center",
        }}>
            {props.allowSelection && <GridCell><Checkbox
                checked={props.selected}
                onChange={(e) => {
                    if (e.target.checked) {
                        props.onSelect(props.info);
                    } else {
                        props.onDeselect(props.info);
                    }
                }}
            /></GridCell>}
            <GridTextCell variant="body2">{props.info.oldFilename}</GridTextCell>
            <GridTextCell variant="body2">{props.info.newFilename}</GridTextCell>
        </GridRow>
    )
}

type BatchMoveFilesHeaderProps = {
    template: string;
}
export const BatchMoveFilesHeader = (props: BatchMoveFilesHeaderProps) => {
    const belowMd = useMediaQuery(theme.breakpoints.down("md"));
    return (
        <Paper sx={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "8px", marginBottom: "8px", flexDirection: belowMd ? "column" : "row" }}>
            <Typography variant="body1" sx={{ marginRight: '12px' }}>Files to move based on the following template:</Typography>
            <Typography variant="body2" component="pre" sx={{ padding: '4px', borderRadius: '4px', border: `1px solid ${theme.palette.divider}` }}>
                {props.template}
            </Typography>
        </Paper>
    );
}

type BatchMoveFilesContentProps = {
    selectedFiles: Set<string>;
    fileInfos: ContentMoveFileInfo[];
    allowSelection: boolean;
    selectFile: (info: ContentMoveFileInfo) => void;
    deselectFile: (info: ContentMoveFileInfo) => void;
}
export const BatchMoveFilesContent = ({ fileInfos, selectedFiles, allowSelection, selectFile, deselectFile }: BatchMoveFilesContentProps) => {
    const columns: ColumnInfo[] = [
        {
            name: "Old Filename",
            size: "auto"
        },
        {
            name: "New Filename",
            size: "auto"
        },
    ]
    if (allowSelection) {
        columns.unshift({
            name: "Move?",
            size: "auto"
        })
    }
    return (
        <GridContainer>
            <GridTable columns={columns}>
                {fileInfos?.map((info) => (
                    <MovableItem
                        key={makeRecordKey(info)}
                        selected={selectedFiles.has(makeRecordKey(info))}
                        info={info}
                        onSelect={selectFile}
                        onDeselect={deselectFile}
                        allowSelection={allowSelection}
                    />
                ))}
            </GridTable>
        </GridContainer>)
}

type BatchMoveFilesActionsProps = {
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onSubmit: () => void;
    onCancel?: () => void;
    onRemoveRecordIfMissingChange: (removeRecordIfMissing: boolean) => void;
    removeRecordIfMissing: boolean;
    totalFiles: number;
    selectedFiles: number;
    allowSelection: boolean;
    isFiltered: boolean;
    additionalActionItems?: {
        placement: "start" | "end";
        actions: JSX.Element[];
    }
} & BoxProps;
export const BatchMoveFilesActions = (props: BatchMoveFilesActionsProps) => {
    const { removeRecordIfMissing, onRemoveRecordIfMissingChange, totalFiles, selectedFiles, onCancel, onSelectAll, onDeselectAll, onSubmit, allowSelection, isFiltered } = props;
    const filesToMove = allowSelection ? selectedFiles : totalFiles;
    const [moveConfirmDialogOpen, setMoveConfirmDialogOpen] = useState(false);
    const openMoveConfirmDialog = () => setMoveConfirmDialogOpen(true);
    const closeMoveConfirmDialog = () => setMoveConfirmDialogOpen(false);
    const onConfirmMove = () => {
        closeMoveConfirmDialog();
        onSubmit();
    }
    const { placement: additionalItemsPlacement, actions: additionalActionItems } = props.additionalActionItems || { placement: "start", actions: [] };
    return (
        <Box sx={
            {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                ...(props.sx || {})
            }
        }>
            <Box sx={{ display: "flex", alignItems: "center", width: "30%" }}>
                <Typography>Remove record if file is missing</Typography>
                <Checkbox
                    checked={removeRecordIfMissing}
                    onChange={(e) => onRemoveRecordIfMissingChange(e.target.checked)}
                />
            </Box>
            <ButtonGroup variant="outlined" sx={{ justifySelf: "end", width: '100%' }}>
                {additionalItemsPlacement === "start" && additionalActionItems}
                {onCancel && <Button onClick={onCancel}>Cancel</Button>}
                {allowSelection && <>
                    <BatchMoveFilesActionButton disabled={filesToMove === 0} onClick={onDeselectAll}>{`Deselect All${isFiltered ? ' In View' : ''}`}</BatchMoveFilesActionButton>
                    <BatchMoveFilesActionButton disabled={filesToMove === totalFiles} onClick={onSelectAll}>{`Select All${isFiltered ? ' In View' : ''}`}</BatchMoveFilesActionButton>
                </>}
                <BatchMoveFilesActionButton variant="contained" disabled={filesToMove === 0} onClick={openMoveConfirmDialog}>{`Move${filesToMove > 0 ? ` ${filesToMove} files` : ''}`}</BatchMoveFilesActionButton>
                {additionalItemsPlacement === "end" && additionalActionItems}
            </ButtonGroup>
            <MoveConfirmDialog open={moveConfirmDialogOpen} onClose={closeMoveConfirmDialog} onConfirm={onConfirmMove} totalFiles={filesToMove} />
        </Box>
    );
}

export const BatchMoveFilesActionButton = styled(Button)<ButtonProps>(() => ({
    flex: 1,
}));

type MoveConfirmDialogProps = {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    totalFiles: number;
}
const MoveConfirmDialog = ({ open, onClose, onConfirm, totalFiles }: MoveConfirmDialogProps) => {
    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>Move Files</DialogTitle>
            <DialogContent>
                <Typography>Are you sure you want to move {totalFiles} files?</Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={onConfirm}>Move</Button>
            </DialogActions>
        </Dialog>
    )
}