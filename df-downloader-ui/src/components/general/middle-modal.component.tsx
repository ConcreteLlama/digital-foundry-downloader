import { Box, Container, IconButton, Modal, ModalProps, Stack } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export const MiddleModal = (props: ModalProps) => {
  const { children, ...other } = props;
  return (
    <Modal {...other}>
      <Container sx={{ outline: "none" }}>
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
              "::-webkit-scrollbar": {
                display: "none",
              },
              bottom: "2%",
            }}
          >
            {children}
          </Box>
        </Stack>
      </Container>
    </Modal>
  );
};
