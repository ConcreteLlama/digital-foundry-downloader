import { Paper, Typography, Divider, Stack, Box } from "@mui/material";
import { useEffect } from "react";
import { queryDfTags } from "../../store/df-tags/df-tags.action";
import { store } from "../../store/store";
import { DfTagDropdown } from "./df-tag-dropdown.component";
import { DfTagModeSelect } from "./df-tag-mode-select.component";
import { updateDfContentQuery } from "../../store/df-content/df-content.action";

export const DfTagBox = () => {
  useEffect(() => {
    store.dispatch(queryDfTags.start);
  }, []);
  return (
    <Paper
      sx={{
        padding: 1,
      }}
    >
      <Stack sx={{ gap: 2, padding: 2 }}>
        <Typography variant="h6">Tags</Typography>
        <Divider sx={{ marginBottom: 2 }} />
        <Box sx={{ display: "flex", width: "100%", gap: 2 }}>
          <DfTagDropdown
            sx={{ width: "100%" }}
            onChange={(tags) => {
              store.dispatch(
                updateDfContentQuery({
                  tags: tags.length ? tags : undefined,
                })
              );
            }}
          />
          <DfTagModeSelect />
        </Box>
      </Stack>
    </Paper>
  );
};
