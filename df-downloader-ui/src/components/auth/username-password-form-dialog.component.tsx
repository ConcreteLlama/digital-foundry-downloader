import { Button, Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useForm } from "react-hook-form";
import { FormContainer, PasswordElement, TextFieldElement } from "react-hook-form-mui";

export type UsernamePasswordFormDialogProps = {
  formName: string;
  children?: React.ReactNode;
  buttonLabel?: string;
  onSubmit: (username: string, password: string) => void;
};
export const UsernamePasswordFormDialog = ({
  formName,
  children,
  buttonLabel,
  onSubmit,
}: UsernamePasswordFormDialogProps) => {
  const { register } = useForm();
  return (
    <Dialog open={true} fullWidth maxWidth={"lg"} id="username-password-form-dialog">
      <DialogTitle>
        <Typography>{formName}</Typography>
      </DialogTitle>
      <DialogContent>
        <FormContainer
          onSuccess={(data) => {
            onSubmit(data.username, data.password);
          }}
        >
          <Stack sx={{ gap: 2 }}>
            {children && children}
            <TextFieldElement label="Username" {...register("username")} />
            <PasswordElement label="Password" {...register("password")} />
            <Button type="submit">{buttonLabel || formName}</Button>
          </Stack>
        </FormContainer>
      </DialogContent>
    </Dialog>
  );
};

/*
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth={"lg"}>
      <Form>
        <DialogTitle>
          <Typography>Registration</Typography>
        </DialogTitle>
        <DialogContent>

          </DialogContent>
          <DialogActions>
            <Button type="submit">Register</Button>
          </DialogActions>
        </Form>
      </Dialog>
      */
