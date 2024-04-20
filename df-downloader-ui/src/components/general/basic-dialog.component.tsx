import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

type BasicDialogProps = {
  title: string;
  content: React.ReactNode | string;
  confirmButtonText: string;
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
};
export const BasicDialog = ({ title, content, confirmButtonText, open, onConfirm, onClose }: BasicDialogProps) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {typeof content === "string" ? <DialogContentText>{content}</DialogContentText> : content}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm}>{confirmButtonText}</Button>
      </DialogActions>
    </Dialog>
  );
};
