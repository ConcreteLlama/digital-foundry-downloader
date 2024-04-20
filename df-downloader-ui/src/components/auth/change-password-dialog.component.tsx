import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { ChangePasswordRequest, Password, logger } from "df-downloader-common";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormContainer, PasswordElement } from "react-hook-form-mui";
import { z } from "zod";
import { API_URL } from "../../config";
import { queryCurrentUser } from "../../store/auth-user/auth-user.actions";
import { store } from "../../store/store";
import { AuthFormStack } from "./auth-form.styles.ts";

const changePasswordSchema = z
  .object({
    oldPassword: z.string(),
    newPassword: Password,
    newPasswordVerify: Password,
  })
  .refine((data) => data.newPassword === data.newPasswordVerify, {
    message: "Passwords must match",
    path: ["newPasswordVerify"],
  });
export type ChangePasswordFormDialogProps = {
  open: boolean;
  onClose: () => void;
};
export const ChangePasswordFormDialog = ({ onClose, open }: ChangePasswordFormDialogProps) => {
  const { register } = useForm();
  const [error, setError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<boolean>(false);
  const onPasswordChangeDialogClose = () => {
    store.dispatch(queryCurrentUser.start());
    setPasswordChangeSuccess(false);
    onClose();
  };
  return passwordChangeSuccess ? (
    <Dialog open={passwordChangeSuccess} fullWidth maxWidth={"lg"}>
      <DialogTitle>
        <Typography>Password Changed</Typography>
      </DialogTitle>
      <DialogContent>
        <Typography>Your password has been changed and you have now been logged out</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onPasswordChangeDialogClose}>Close</Button>
      </DialogActions>
    </Dialog>
  ) : (
    <Dialog open={open} fullWidth maxWidth={"lg"}>
      <DialogTitle>
        <Typography>Change Password</Typography>
      </DialogTitle>
      <DialogContent>
        <FormContainer
          resolver={zodResolver(changePasswordSchema)}
          onSuccess={(data) => {
            const changePasswordRequest: ChangePasswordRequest = {
              oldPassword: data.oldPassword,
              newPassword: data.newPassword,
            };
            fetch(`${API_URL}/auth/change-password`, {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(changePasswordRequest),
            })
              .then((response) => {
                if (response.ok) {
                  setPasswordChangeSuccess(true);
                  onClose();
                } else {
                  setError("Change password failed");
                }
              })
              .catch(() => {
                setError("Change password failed");
              });
          }}
          onError={(error) => {
            logger.log("error", "Error changing password", error);
          }}
        >
          <AuthFormStack>
            <PasswordElement label="Old Password" {...register("oldPassword")} />
            <PasswordElement label="New Password" {...register("newPassword")} />
            <PasswordElement label="Re-enter New Password" {...register("newPasswordVerify")} />
            {error && <Typography color="error">{error}</Typography>}
            <Button type="submit">Change Password</Button>
          </AuthFormStack>
        </FormContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
