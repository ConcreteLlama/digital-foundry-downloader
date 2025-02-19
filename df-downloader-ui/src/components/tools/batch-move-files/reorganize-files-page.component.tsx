import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Input, LinearProgress, List, ListItem, Stack, Typography } from "@mui/material";
import { ContentMoveFileInfo, MoveFilesRequest, MoveFilesTaskInfo, parseResponseBody, PreviewMoveRequest, PreviewMoveResponse } from "df-downloader-common";
import { useEffect, useState } from "react";
import { useFormState } from "react-hook-form";
import { useSelector } from "react-redux";
import { clearTask } from "../../../api/tasks.ts";
import { API_URL } from "../../../config.ts";
import { useQuery } from "../../../hooks/use-query.ts";
import { queryConfigSection } from "../../../store/config/config.action.ts";
import { selectConfigSectionField } from "../../../store/config/config.selector.ts";
import { selectBatchMoveFilesTasks } from "../../../store/df-tasks/tasks.selector.ts";
import { store } from "../../../store/store.ts";
import { theme } from "../../../themes/theme.ts";
import { postJson } from "../../../utils/fetch.ts";
import { Loading } from "../../general/loading.component.tsx";
import { InlineDfSettingsSection } from "../../settings/df-settings-section-form.component.tsx";
import { TemplateBuilderField } from "../../settings/template/template-builder-field.tsx";
import { BatchMoveFilesActionButton, BatchMoveFilesActions, BatchMoveFilesContent, BatchMoveFilesHeader, makeRecordKey } from "./reorganize-files.components.tsx";

export const ReorgnaizeFilesPage = () => {
  // TODO: Separate this out so I can have the query elsewhere, may want to just do limited subset of move. But for now let's
  // just assume this is always a batch mover from template
  useEffect(() => {
    store.dispatch(queryConfigSection.start('contentManagement'));
  }, []);
  const fetchFileInfos = async () => {
    if (!template) {
      return [];
    }
    const requestBody: PreviewMoveRequest = {
      contentNames: "all",
      templateString: template,
    }
    const response = await postJson(`${API_URL}/content/preview-move`, requestBody);
    const parsed = parseResponseBody(response, PreviewMoveResponse);
    return parsed.data?.results;
  }
  const batchMoveFilesTasks = useSelector(selectBatchMoveFilesTasks);
  const template = useSelector(selectConfigSectionField("contentManagement", "filenameTemplate")) || '';
  const { data: fileInfos, loading, error, refetch } = useQuery({
    fetch: () => fetchFileInfos(),
    triggerOnMount: false,
  });
  useEffect(() => {
    if (batchMoveFilesTasks.length === 0) {
      refetch();
    }
    setSelectedFiles(new Set());
  }, [template, batchMoveFilesTasks]);
  const [allowSelection,] = useState(true);

  const [templateSettingsOpen, setTemplateSettingsOpen] = useState(false);

  const closeTemplateSettings = () => setTemplateSettingsOpen(false);

  const [removeRecordIfMissing, setRemoveRecordIfMissing] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const openTemplateSettings = () => setTemplateSettingsOpen(true);

  const selectFile = (info: ContentMoveFileInfo) => setSelectedFiles((prev) => {
    const newSelectedFiles = new Set(prev);
    newSelectedFiles.add(makeRecordKey(info));
    return newSelectedFiles;
  });

  const deselectFile = (info: ContentMoveFileInfo) => setSelectedFiles((prev) => {
    const newSelectedFiles = new Set(prev);
    newSelectedFiles.delete(makeRecordKey(info));
    return newSelectedFiles;
  });

  const selectAllInView = () => setSelectedFiles((prev) => {
    const newSelectedFiles = new Set(prev);
    filteredFiles?.forEach((info) => newSelectedFiles.add(makeRecordKey(info)));
    return newSelectedFiles;
  });
  const deselectAllInView = () => setSelectedFiles((prev) => {
    const newSelectedFiles = new Set(prev);
    filteredFiles?.forEach((info) => newSelectedFiles.delete(makeRecordKey(info)));
    return newSelectedFiles
  });

  const sendMoveFilesRequest = async () => {
    const filesToMove = fileInfos?.filter((info) => selectedFiles.has(makeRecordKey(info)));
    let moveFilesRequest: MoveFilesRequest;
    if (!fileInfos?.length) {
      return;
    }
    if (allowSelection && filesToMove?.length !== fileInfos?.length) {
      if (!filesToMove || filesToMove.length === 0) {
        return;
      }
      moveFilesRequest = {
        toMove: filesToMove || [],
        overwrite: true,
        removeRecordIfMissing,
      }
    } else {
      moveFilesRequest = {
        template: template,
        overwrite: true,
        removeRecordIfMissing,
      }
    }

    try {
      await postJson(`${API_URL}/content/move-files`, moveFilesRequest);
      setSelectedFiles(new Set());
    } catch (e) {
      console.error(e);
    } finally {
    }
  }
  const [filterText, setFilterText] = useState("");
  const [filteredFiles, setFilteredFiles] = useState<ContentMoveFileInfo[] | undefined>(fileInfos || []);
  useEffect(() => {
    const filterLower = filterText.toLowerCase();
    setFilteredFiles(fileInfos?.filter((info) => {
      return info.oldFilename.toLowerCase().includes(filterLower) || info.newFilename.toLowerCase().includes(filterLower);
    }).sort((a, b) => {
      // Sort by old filename but put at top of the list if checked
      const aSelected = selectedFiles.has(makeRecordKey(a));
      const bSelected = selectedFiles.has(makeRecordKey(b));
      if (aSelected && !bSelected) {
        return -1;
      }
      if (!aSelected && bSelected) {
        return 1;
      }
      return a.oldFilename.localeCompare(b.oldFilename);
    }));
  }, [fileInfos, filterText, selectedFiles]);
  return (
    <Stack height="89vh" gap={2} width={"100%"} key="reorganize-files-page" id="reorganize-files-page">
      <Typography variant="h4">Reorganize Files</Typography>
      <TemplateSettingsDialog open={templateSettingsOpen} onClose={closeTemplateSettings} />
      {batchMoveFilesTasks.length > 0 ? <Box sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing(2),
      }}>
        {
          batchMoveFilesTasks.map((task) => <BatchMoveFilesProgress {...task} />)
        }
      </Box> :
        loading ? <Loading /> : error ? <Typography>Error loading file infos: {error}</Typography> :
          !(fileInfos?.length) ? <>
            <Typography>All of your downloaded content currently matches the existing template, no files to move</Typography>
            <ButtonGroup>
              <Button onClick={refetch}>Refresh</Button>
              <Button onClick={openTemplateSettings}>Edit Template</Button>
            </ButtonGroup>
          </> :
            <>
              <BatchMoveFilesHeader template={template} />
              <Input
                placeholder="Start typing to filter"
                value={filterText}
                onChange={(event) => {
                  setFilterText(event.target.value);
                }}
                endAdornment={<Button onClick={() => setFilterText("")}>Clear</Button>}
              />
              {filteredFiles?.length ? 
                <BatchMoveFilesContent fileInfos={filteredFiles || []} selectedFiles={selectedFiles} selectFile={selectFile} deselectFile={deselectFile} allowSelection={allowSelection} />
                :
                <Typography>No files match the filter</Typography>
              }
              <Divider
                sx={{
                  marginY: 2
                }}
              />
              <Box sx={{ marginTop: 'auto', width: "100%" }}>
                <BatchMoveFilesActions
                  allowSelection={allowSelection}
                  isFiltered={filterText.length > 0}
                  onSelectAll={selectAllInView}
                  onDeselectAll={deselectAllInView}
                  onSubmit={sendMoveFilesRequest}
                  onRemoveRecordIfMissingChange={setRemoveRecordIfMissing}
                  removeRecordIfMissing={removeRecordIfMissing}
                  totalFiles={fileInfos?.length || 0}
                  selectedFiles={selectedFiles.size}
                  additionalActionItems={{
                    placement: "start",
                    actions: [<BatchMoveFilesActionButton onClick={openTemplateSettings}>Edit Template</BatchMoveFilesActionButton>]
                  }}
                  sx={{
                    justifySelf: "end",
                    width: "100%"
                  }}
                />
              </Box>
            </>
      }
    </Stack>
  );
};

type TemplateSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
}
const TemplateSettingsDialog = ({ open, onClose }: TemplateSettingsDialogProps) => {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" id="template-settings-dialog">
    <InlineDfSettingsSection sectionName="contentManagement" onSubmit={onClose}>
      <TemplateSettings open={open} onClose={onClose} />
    </InlineDfSettingsSection>
  </Dialog>
}
const TemplateSettings = ({ onClose }: TemplateSettingsDialogProps) => {
  const { isDirty } = useFormState();
  return <>
    <DialogTitle>Template Settings</DialogTitle>
    <DialogContent>
      <Box sx={{ display: "flex", paddingY: 2, maxWidth: "100%" }}>
        <TemplateBuilderField alwaysExpand />
      </Box>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button disabled={!isDirty} type="submit" variant="contained">
        Update
      </Button>
    </DialogActions>
  </>
}

const BatchMoveFilesProgress = (taskInfo: MoveFilesTaskInfo) => {
  const progressInfo = taskInfo.status?.currentProgress;
  const total = progressInfo?.total || 0;
  const recordsRemoved = progressInfo?.recordRemoved || 0;
  const moved = progressInfo?.moved || 0;
  const failed = progressInfo?.failed || 0;
  const moving = progressInfo?.moving || 0;
  const completed = progressInfo?.complete || 0;
  const completedPercent = (completed / total) * 100;
  const movingPercent = (moving / total) * 100;
  const extraInfos: string[] = [];
  if (recordsRemoved > 0) {
    extraInfos.push(`${recordsRemoved} record${recordsRemoved > 1 ? 's' : ''} removed`);
  }
  if (failed > 0) {
    extraInfos.push(`${failed} failed`);
  }
  if (taskInfo.result) {
    const clearTaskInfo = () => clearTask(taskInfo.id);
    const extraInfoString = extraInfos.length > 0 ? ` (${extraInfos.join(', ')})` : ' ';
    const taskCompletedString = `Moved ${moved} files${extraInfoString}`;
    return <Stack>
      {taskInfo.result.errors.length ? (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">{taskCompletedString}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack sx={{
              overflowY: 'auto',
              maxHeight: "50vh",
            }}>
              <List>
                {taskInfo.result.errors.map((error, i) => <ListItem><Typography key={`task-${taskInfo.id}-error-${i}`}>{error}</Typography></ListItem>)}
              </List>
            </Stack>
          </AccordionDetails>
        </Accordion>
      ) : (
        <Typography>{taskCompletedString}</Typography>
      )}
      <Button onClick={clearTaskInfo}>OK</Button>
    </Stack>
  }
  const extraInfoString = extraInfos.length > 0 ? ` (${moved} moved, ${extraInfos.join(', ')})` : ' ';
  const taskLabel = taskInfo.status?.state === "idle" ? "Task is queued" : `${completed}/${total} completed${extraInfoString}, ${moving} in progress`
  return (
    <Stack>
      <LinearProgress variant="buffer" value={completedPercent || 0} valueBuffer={movingPercent || 0} />
      <Typography>{taskLabel}</Typography>
    </Stack>
  )
}