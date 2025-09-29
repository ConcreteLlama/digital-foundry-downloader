import { Fab } from "@mui/material";
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
        defaultTab="htmlImport"
      />

      <Fab
        color="primary"
        aria-label="Import content"
        sx={{
          position: "fixed",
          bottom: 80,
          right: 24,
          zIndex: 1000,
        }}
        onClick={handleClick}
      >
        <AddIcon />
      </Fab>
    </>
  );
};