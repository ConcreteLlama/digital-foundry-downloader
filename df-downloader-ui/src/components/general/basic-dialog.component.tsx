import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogProps, DialogTitle } from "@mui/material";

type BasicDialogProps = {
  title: string;
  content: React.ReactNode | string;
  confirmButtonText: string;
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
  // "content" omitted from the inherited props deliberately: DialogProps
  // carries React's HTML attributes, where `content` is the <meta> attribute
  // and typed as a string. Intersecting with that quietly collapsed the
  // ReactNode above to a string, so the component's own branch for rendering
  // an element was unreachable - every caller had simply passed text.
} & Omit<Partial<DialogProps>, "content">;
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
