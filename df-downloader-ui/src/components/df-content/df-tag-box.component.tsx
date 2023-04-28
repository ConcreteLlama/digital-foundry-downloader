import { Paper, Typography, Box, Divider, Stack } from "@mui/material";
import { useEffect } from "react";
import { queryDfTags } from "../../store/df-tags/df-tags.action";
import { store } from "../../store/store";
import { DfTagDropdown } from "./df-tag-dropdown.component";
import { DfTagModeSelect } from "./df-tag-mode-select.component";
import { updateDfContentInfoQuery } from "../../store/df-content/df-content.action";

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
      <Stack sx={{ gap: 1 }}>
        <Typography variant="h6">Tags</Typography>
        <Typography variant="h6">TODO: Should this be an advanced search form rather than just for tags?</Typography>
        <Divider />
        <Box sx={{ display: "flex", gap: 1 }}>
          <DfTagDropdown
            onChange={(tags) => {
              store.dispatch(
                updateDfContentInfoQuery({
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
