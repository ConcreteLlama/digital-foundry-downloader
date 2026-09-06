import { Box, Stack, Typography } from "@mui/material";
import { TaskOutputField } from "df-downloader-common";
import { monoFontFamily } from "../../themes/build-theme";

/**
 * What a task or one of its parts produced, as labelled rows.
 *
 * Short values sit beside their label; long ones get a block of their own,
 * because a 1,200-character summary and "94% sure" are both "the output" and
 * rendering them the same way is what makes a generic view look thoughtless.
 *
 * Knows nothing about what produced any of it - see TaskOutputField.
 */
export const TaskOutputFields = ({ fields }: { fields: TaskOutputField[] }) => (
  <Stack spacing={1}>
    {fields.map((field) =>
      field.long ? (
        <Stack key={field.label} spacing={0.25}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {field.label}
          </Typography>
          <Box
            sx={{
              fontFamily: monoFontFamily,
              fontSize: "0.75rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              backgroundColor: "action.hover",
              borderRadius: 1,
              padding: 1,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {field.value}
          </Box>
        </Stack>
      ) : (
        <Stack key={field.label} direction="row" spacing={2} sx={{ alignItems: "baseline" }}>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 110, flexShrink: 0 }}>
            {field.label}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: monoFontFamily, wordBreak: "break-word" }}>
            {field.value}
          </Typography>
        </Stack>
      )
    )}
  </Stack>
);
