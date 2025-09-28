import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  FormControlLabel,
  Switch,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { importHtmlContent } from "../../store/df-tasks/tasks.action";
import { listenerMiddleware } from "../../store/listener";

export type HtmlImportDialogProps = {
  open: boolean;
  onClose: () => void;
};

interface HtmlImportData {
  htmlContent: string;
  triggerAutoDownload: boolean;
}

export const HtmlImportDialog = ({ open, onClose }: HtmlImportDialogProps) => {
  const dispatch = useDispatch();
  const [importData, setImportData] = useState<HtmlImportData>({
    htmlContent: "",
    triggerAutoDownload: false,
  });

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!isImporting) return;

    // Set up listeners for success/failure
    const successUnsubscribe = listenerMiddleware.startListening({
      actionCreator: importHtmlContent.success,
      effect: (action) => {
        const result = action.payload;
        setIsImporting(false);

        if (result.success) {
          setImportResult(result.message || "Import completed successfully");

          // Reset form
          setImportData({
            htmlContent: "",
            triggerAutoDownload: false,
          });

          // Close dialog after showing success
          setTimeout(() => {
            onClose();
            setImportResult(null);
          }, 1500);
        } else {
          setImportError(result.message || "Import failed - no content found");
        }
      },
    });

    const failureUnsubscribe = listenerMiddleware.startListening({
      actionCreator: importHtmlContent.failed,
      effect: (action) => {
        setIsImporting(false);
        setImportError(action.payload?.message || "Import failed");
      },
    });

    return () => {
      successUnsubscribe();
      failureUnsubscribe();
    };
  }, [isImporting, onClose]);

  const handleSubmit = () => {
    if (!importData.htmlContent.trim()) {
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    setImportError(null);

    dispatch(
      importHtmlContent.start({
        htmlContent: importData.htmlContent,
        triggerAutoDownload: importData.triggerAutoDownload,
      })
    );
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>Import HTML Content</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Paste HTML content from Patreon pages to automatically extract and import content with download links.
          </Typography>

          <TextField
            fullWidth
            required
            multiline
            rows={12}
            label="HTML Content"
            value={importData.htmlContent}
            onChange={(e) => setImportData(prev => ({ ...prev, htmlContent: e.target.value }))}
            placeholder="Paste your HTML content here..."
            disabled={isImporting}
          />

          <FormControlLabel
            control={
              <Switch
                checked={importData.triggerAutoDownload}
                onChange={(e) => setImportData(prev => ({ ...prev, triggerAutoDownload: e.target.checked }))}
                disabled={isImporting}
              />
            }
            label="Automatically start downloads after import"
          />

          <Typography variant="caption" color="textSecondary">
            When enabled, downloads will be automatically queued for all imported content.
            When disabled, content will only be added to the database for manual download later.
          </Typography>

          {isImporting && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Processing HTML content...</Typography>
            </Box>
          )}

          {importResult && (
            <Alert severity="success">
              {importResult}
            </Alert>
          )}

          {importError && (
            <Alert severity="error">
              {importError}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isImporting}>
          {importResult ? "Close" : "Cancel"}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!importData.htmlContent.trim() || isImporting}
        >
          {isImporting ? "Importing..." : "Import Content"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};