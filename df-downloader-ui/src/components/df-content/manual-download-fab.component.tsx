import { Fab } from "@mui/material";
import { MOBILE_TAB_BAR_HEIGHT } from "../../routes/nav/mobile-tab-bar.component";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { ContentImportDialog } from "./content-import-dialog.component";

export const ManualDownloadFloatingButton = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = () => {
    setDialogOpen(true);
  };

  return (
    <>
      <ContentImportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      <Fab
        color="primary"
        aria-label="Import content"
        sx={{
          position: "fixed",
          // Clears the mobile tab bar rather than floating over the last row
          // of the list. The bottom AppBar it used to clear on desktop is gone
          // (pagination is inline now), so it can sit lower there.
          bottom: { xs: `${MOBILE_TAB_BAR_HEIGHT + 16}px`, md: 24 },
          right: { xs: 16, md: 24 },
          zIndex: 1000,
        }}
        onClick={handleClick}
      >
        <AddIcon />
      </Fab>
    </>
  );
};