import {
  Box,
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
import { selectConfigSectionField } from "../../store/config/config.selector";

export interface ManualDownloadData {
  url: string;
  title: string;
  description?: string;
  publishedDate?: string;
  tags?: string[];
  mediaFormat?: string;
  youtubeUrl?: string;
}

export interface ManualDownloadTabProps {
  data: ManualDownloadData;
  onChange: (data: ManualDownloadData) => void;
  onSubmit: () => void;
}

export const ManualDownloadTab = ({
  data,
  onChange,
}: ManualDownloadTabProps) => {
  const [newTag, setNewTag] = useState("");
  const mediaFormats = useSelector(selectConfigSectionField("mediaFormats", "priorities")) || [];

  const updateData = (updates: Partial<ManualDownloadData>) => {
    onChange({ ...data, ...updates });
  };

  const addTag = () => {
    if (newTag.trim() && !data.tags?.includes(newTag.trim())) {
      updateData({
        tags: [...(data.tags || []), newTag.trim()]
      });
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    updateData({
      tags: data.tags?.filter(tag => tag !== tagToRemove) || []
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
      <TextField
        fullWidth
        required
        label="Download URL"
        value={data.url}
        onChange={(e) => updateData({ url: e.target.value })}
        placeholder="https://example.com/video.mp4"
      />

      <TextField
        fullWidth
        required
        label="Title"
        value={data.title}
        onChange={(e) => updateData({ title: e.target.value })}
        placeholder="DF Video Title"
      />

      <TextField
        fullWidth
        multiline
        rows={3}
        label="Description"
        value={data.description}
        onChange={(e) => updateData({ description: e.target.value })}
        placeholder="Video description..."
      />

      <TextField
        fullWidth
        label="Published Date"
        type="datetime-local"
        value={data.publishedDate}
        onChange={(e) => updateData({ publishedDate: e.target.value })}
        InputLabelProps={{ shrink: true }}
      />

      <TextField
        fullWidth
        label="YouTube URL (optional)"
        value={data.youtubeUrl}
        onChange={(e) => updateData({ youtubeUrl: e.target.value })}
        placeholder="https://youtube.com/watch?v=..."
      />

      {mediaFormats.length > 0 && (
        <FormControl fullWidth>
          <InputLabel>Media Format</InputLabel>
          <Select
            value={data.mediaFormat}
            onChange={(e) => updateData({ mediaFormat: e.target.value })}
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
          {data.tags?.map((tag) => (
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
  );
};