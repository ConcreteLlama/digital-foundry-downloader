import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogProps, DialogTitle } from "@mui/material";

type BasicDialogProps = {
  title: string;
  content: React.ReactNode | string;
  confirmButtonText: string;
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
} & Partial<DialogProps>;
export const BasicDialog = ({ title, content, confirmButtonText, open, onConfirm, onClose, ...other }: BasicDialogProps) => {
  return (
    <Dialog {...other} open={open} onClose={onClose}>
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
