import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tabs,
  Tab,
} from "@mui/material";
import { useState, useEffect, useRef } from "react";
import { startManualDownload } from "../../store/df-tasks/tasks.action";
import { store } from "../../store/store";
import { HtmlImportTab, HtmlImportData, HtmlImportTabRef } from "./html-import-tab.component";
import { ManualDownloadTab, ManualDownloadData } from "./manual-download-tab.component";

export type ContentImportDialogProps = {
  open: boolean;
  onClose: () => void;
  defaultTab?: "htmlImport" | "manualDownload";
};

export const ContentImportDialog = ({
  open,
  onClose,
  defaultTab = "htmlImport"
}: ContentImportDialogProps) => {
  const [activeTab, setActiveTab] = useState<"htmlImport" | "manualDownload">(defaultTab);
  const htmlImportTabRef = useRef<HtmlImportTabRef>(null);

  // Manual Download State
  const [downloadData, setDownloadData] = useState<ManualDownloadData>({
    url: "",
    title: "",
    description: "",
    publishedDate: "",
    tags: [],
    mediaFormat: "",
    youtubeUrl: "",
  });

  // HTML Import State
  const [importData, setImportData] = useState<HtmlImportData>({
    htmlContent: "",
    triggerAutoDownload: false,
  });
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Update active tab when defaultTab prop changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: "htmlImport" | "manualDownload") => {
    setActiveTab(newValue);
  };

  const handleManualDownloadSubmit = () => {
    if (!downloadData.url || !downloadData.title) {
      return;
    }

    store.dispatch(
      startManualDownload.start({
        url: downloadData.url,
        title: downloadData.title,
        description: downloadData.description,
        publishedDate: downloadData.publishedDate || new Date().toISOString(),
        tags: downloadData.tags,
        mediaFormat: downloadData.mediaFormat,
        youtubeUrl: downloadData.youtubeUrl,
      })
    );

    // Reset form
    setDownloadData({
      url: "",
      title: "",
      description: "",
      publishedDate: "",
      tags: [],
      mediaFormat: "",
      youtubeUrl: "",
    });
    onClose();
  };

  const handleHtmlImportSubmit = () => {
    htmlImportTabRef.current?.submit();
  };

  const handleClose = () => {
    onClose();
  };

  const getDialogActions = () => {
    if (activeTab === "htmlImport") {
      return (
        <>
          <Button onClick={handleClose} disabled={isImporting}>
            {importResult ? "Close" : "Cancel"}
          </Button>
          <Button
            onClick={handleHtmlImportSubmit}
            variant="contained"
            disabled={!importData.htmlContent.trim() || isImporting}
          >
            {isImporting ? "Importing..." : "Import Content"}
          </Button>
        </>
      );
    } else {
      return (
        <>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleManualDownloadSubmit}
            variant="contained"
            disabled={!downloadData.url || !downloadData.title}
          >
            Start Download
          </Button>
        </>
      );
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>Content Import</DialogTitle>
      <DialogContent>
        <Tabs value={activeTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tab label="HTML Import" value="htmlImport" />
          <Tab label="Manual Download" value="manualDownload" />
        </Tabs>

        {activeTab === "htmlImport" && (
          <HtmlImportTab
            ref={htmlImportTabRef}
            data={importData}
            onChange={setImportData}
            isImporting={isImporting}
            setIsImporting={setIsImporting}
            importResult={importResult}
            setImportResult={setImportResult}
            importError={importError}
            setImportError={setImportError}
            onClose={onClose}
          />
        )}

        {activeTab === "manualDownload" && (
          <ManualDownloadTab
            data={downloadData}
            onChange={setDownloadData}
            onSubmit={handleManualDownloadSubmit}
          />
        )}
      </DialogContent>
      <DialogActions>
        {getDialogActions()}
      </DialogActions>
    </Dialog>
  );
};