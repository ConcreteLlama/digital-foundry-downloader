import {
  Box,
  TextField,
  Typography,
  FormControlLabel,
  Switch,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useEffect, useImperativeHandle, forwardRef } from "react";
import { useDispatch } from "react-redux";
import { importHtmlContent } from "../../store/df-tasks/tasks.action";
import { listenerMiddleware } from "../../store/listener";

export interface HtmlImportData {
  htmlContent: string;
  triggerAutoDownload: boolean;
}

export interface HtmlImportTabRef {
  submit: () => void;
}

export interface HtmlImportTabProps {
  data: HtmlImportData;
  onChange: (data: HtmlImportData) => void;
  isImporting: boolean;
  setIsImporting: (importing: boolean) => void;
  importResult: string | null;
  setImportResult: (result: string | null) => void;
  importError: string | null;
  setImportError: (error: string | null) => void;
  onClose: () => void;
}

export const HtmlImportTab = forwardRef<HtmlImportTabRef, HtmlImportTabProps>(({
  data,
  onChange,
  isImporting,
  setIsImporting,
  importResult,
  setImportResult,
  importError,
  setImportError,
  onClose,
}, ref) => {
  const dispatch = useDispatch();

  // Set up listeners for import success/failure
  useEffect(() => {
    if (!isImporting) return;

    const successUnsubscribe = listenerMiddleware.startListening({
      actionCreator: importHtmlContent.success,
      effect: (action) => {
        const result = action.payload;
        setIsImporting(false);

        if (result.success) {
          setImportResult(result.message || "Import completed successfully");

          // Reset form
          onChange({
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
  }, [isImporting, onClose, onChange, setIsImporting, setImportResult, setImportError]);

  const handleSubmit = () => {
    if (!data.htmlContent.trim()) {
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    setImportError(null);

    dispatch(
      importHtmlContent.start({
        htmlContent: data.htmlContent,
        triggerAutoDownload: data.triggerAutoDownload,
      })
    );
  };

  const updateData = (updates: Partial<HtmlImportData>) => {
    onChange({ ...data, ...updates });
  };

  // Expose submit function to parent via ref
  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
  }));

  return (
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
        value={data.htmlContent}
        onChange={(e) => updateData({ htmlContent: e.target.value })}
        placeholder="Paste your HTML content here..."
        disabled={isImporting}
      />

      <FormControlLabel
        control={
          <Switch
            checked={data.triggerAutoDownload}
            onChange={(e) => updateData({ triggerAutoDownload: e.target.checked })}
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
  );
});