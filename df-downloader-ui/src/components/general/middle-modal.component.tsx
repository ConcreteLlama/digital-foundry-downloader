import CloseIcon from "@mui/icons-material/Close";
import { Box, IconButton, Modal, ModalProps, Stack } from "@mui/material";
import { ResponsiveModalContainer } from "./middle-modal.styles.ts";

export const MiddleModal = (props: ModalProps) => {
  const { children, ...other } = props;
  return (
    <Modal {...other}>
      <ResponsiveModalContainer sx={{ outline: "none" }}>
        <Stack>
          <IconButton
            onClick={() => {
              props.onClose?.({}, "backdropClick");
            }}
            sx={{
              alignSelf: "flex-end",
            }}
          >
            <CloseIcon />
          </IconButton>
          <Box
            sx={{
              overflow: "auto",
              maxHeight: "94vh",
              maxWidth: "99vw",
              "::-webkit-scrollbar": {
                display: "none",
              },
              bottom: "2%",
            }}
          >
            {children}
          </Box>
        </Stack>
      </ResponsiveModalContainer>
    </Modal>
  );
};
