import CloseIcon from "@mui/icons-material/Close";
import { Box, IconButton, Modal, ModalProps } from "@mui/material";
import { useViewportHeight } from "../../hooks/use-viewport-height.ts";
import { ResponsiveModalContainer } from "./middle-modal.styles.ts";

export type MiddleModalProps = ModalProps & {
  /**
   * Set when the content draws its own close control, so it can sit inline
   * with that content's title instead of floating above it. Off by default:
   * a modal must never end up with no way out just because its child did not
   * think to provide one.
   */
  hideCloseButton?: boolean;
};

export const MiddleModal = (props: MiddleModalProps) => {
  const { children, hideCloseButton, ...other } = props;
  const viewportHeight = useViewportHeight();
  return (
    <Modal {...other}>
      <ResponsiveModalContainer sx={{ outline: "none" }}>
        {/*
          Shrink-wraps the panel, so "top right" below is the panel's own top
          right rather than the viewport's. The close button used to sit in a
          row ABOVE the panel, floating on the backdrop - which spent ~40px of
          height plus a gap on a control that looked detached from the thing it
          closed, and cost the content that height on every screen.

          Outside the scrolling box on purpose: in it, the button would scroll
          away from a long page and leave no visible way out.
        */}
        <Box sx={{ position: "relative", display: "flex", minHeight: 0, maxWidth: "99vw" }}>
          <Box
            sx={{
              overflow: "auto",
              maxHeight: `${viewportHeight * 0.94}px`,
              maxWidth: "100%",
              "::-webkit-scrollbar": {
                display: "none",
              },
            }}
          >
            {children}
          </Box>
          {!hideCloseButton && (
          <IconButton
            aria-label="Close"
            onClick={() => {
              props.onClose?.({}, "backdropClick");
            }}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 1,
              // Legible wherever it lands - the panel scrolls underneath it.
              backgroundColor: "background.paper",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            <CloseIcon />
          </IconButton>
          )}
        </Box>
      </ResponsiveModalContainer>
    </Modal>
  );
};
