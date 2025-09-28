import { Fab, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { ManualDownloadDialog } from "./manual-download-dialog.component";

export const ManualDownloadFloatingButton = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <ManualDownloadDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <Tooltip title="Manual Download" placement="left">
        <Fab
          color="primary"
          aria-label="manual download"
          onClick={() => setDialogOpen(true)}
          sx={{
            position: "fixed",
            bottom: 80,
            right: 24,
            zIndex: 1000,
          }}
        >
          <AddIcon />
        </Fab>
      </Tooltip>
    </>
  );
};