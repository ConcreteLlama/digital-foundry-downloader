import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  Chip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useState } from "react";
import { useSelector } from "react-redux";
import { startManualDownload } from "../../store/df-tasks/tasks.action";
import { store } from "../../store/store";
import { selectConfigSectionField } from "../../store/config/config.selector";

export type ManualDownloadDialogProps = {
  open: boolean;
  onClose: () => void;
};

interface ManualDownloadData {
  url: string;
  title: string;
  description?: string;
  publishedDate?: string;
  tags?: string[];
  mediaFormat?: string;
  youtubeUrl?: string;
}

export const ManualDownloadDialog = ({ open, onClose }: ManualDownloadDialogProps) => {
  const [downloadData, setDownloadData] = useState<ManualDownloadData>({
    url: "",
    title: "",
    description: "",
    publishedDate: "",
    tags: [],
    mediaFormat: "",
    youtubeUrl: "",
  });

  const [newTag, setNewTag] = useState("");
  const mediaFormats = useSelector(selectConfigSectionField("mediaFormats", "priorities")) || [];

  const handleSubmit = () => {
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
    setNewTag("");
    onClose();
  };

  const addTag = () => {
    if (newTag.trim() && !downloadData.tags?.includes(newTag.trim())) {
      setDownloadData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), newTag.trim()]
      }));
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setDownloadData(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || []
    }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Manual Download</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            fullWidth
            required
            label="Download URL"
            value={downloadData.url}
            onChange={(e) => setDownloadData(prev => ({ ...prev, url: e.target.value }))}
            placeholder="https://example.com/video.mp4"
          />

          <TextField
            fullWidth
            required
            label="Title"
            value={downloadData.title}
            onChange={(e) => setDownloadData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="DF Video Title"
          />

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            value={downloadData.description}
            onChange={(e) => setDownloadData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Video description..."
          />

          <TextField
            fullWidth
            label="Published Date"
            type="datetime-local"
            value={downloadData.publishedDate}
            onChange={(e) => setDownloadData(prev => ({ ...prev, publishedDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            fullWidth
            label="YouTube URL (optional)"
            value={downloadData.youtubeUrl}
            onChange={(e) => setDownloadData(prev => ({ ...prev, youtubeUrl: e.target.value }))}
            placeholder="https://youtube.com/watch?v=..."
          />

          {mediaFormats.length > 0 && (
            <FormControl fullWidth>
              <InputLabel>Media Format</InputLabel>
              <Select
                value={downloadData.mediaFormat}
                onChange={(e) => setDownloadData(prev => ({ ...prev, mediaFormat: e.target.value }))}
                label="Media Format"
              >
                <MenuItem value="">
                  <em>Auto-detect</em>
                </MenuItem>
                {mediaFormats.map((format: string) => (
                  <MenuItem key={format} value={format}>
                    {format}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Tags
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
              {downloadData.tags?.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  onDelete={() => removeTag(tag)}
                  deleteIcon={<DeleteIcon />}
                  size="small"
                />
              ))}
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                size="small"
                label="Add tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addTag()}
              />
              <IconButton onClick={addTag} disabled={!newTag.trim()}>
                <AddIcon />
              </IconButton>
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!downloadData.url || !downloadData.title}
        >
          Start Download
        </Button>
      </DialogActions>
    </Dialog>
  );
};