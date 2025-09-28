import { SpeedDial, SpeedDialAction } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import HtmlIcon from "@mui/icons-material/Html";
import { useState } from "react";
import { ManualDownloadDialog } from "./manual-download-dialog.component";
import { HtmlImportDialog } from "./html-import-dialog.component";

export const ManualDownloadFloatingButton = () => {
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [htmlDialogOpen, setHtmlDialogOpen] = useState(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);

  return (
    <>
      <ManualDownloadDialog
        open={manualDialogOpen}
        onClose={() => setManualDialogOpen(false)}
      />
      <HtmlImportDialog
        open={htmlDialogOpen}
        onClose={() => setHtmlDialogOpen(false)}
      />
      <SpeedDial
        ariaLabel="Content import options"
        sx={{
          position: "fixed",
          bottom: 80,
          right: 24,
          zIndex: 1000,
        }}
        icon={<AddIcon />}
        open={speedDialOpen}
        onOpen={() => setSpeedDialOpen(true)}
        onClose={() => setSpeedDialOpen(false)}
      >
        <SpeedDialAction
          icon={<DownloadIcon />}
          tooltipTitle="Manual Download"
          onClick={() => {
            setSpeedDialOpen(false);
            setManualDialogOpen(true);
          }}
        />
        <SpeedDialAction
          icon={<HtmlIcon />}
          tooltipTitle="Import from HTML"
          onClick={() => {
            setSpeedDialOpen(false);
            setHtmlDialogOpen(true);
          }}
        />
      </SpeedDial>
    </>
  );
};