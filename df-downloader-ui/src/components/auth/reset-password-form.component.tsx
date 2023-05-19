import { FormContainer, PasswordElement, TextFieldElement, useForm } from "react-hook-form-mui";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  BasicUserIdRequest,
  ChangePasswordRequest,
  Password,
  ValidateResetTokenRequest,
  ValidateResetTokenResponse,
  parseResponseBody,
} from "df-downloader-common";
import { zodResolver } from "@hookform/resolvers/zod";
import { API_URL } from "../../config";
import { Button, Stack, Typography } from "@mui/material";
import { postJson } from "../../utils/fetch";

export type ResetPasswordFormProps = {
  username?: string | null;
  resetToken?: string | null;
  onClose: () => void;
};
export const ResetPasswordForm = ({ onClose, username: inputUsername, resetToken }: ResetPasswordFormProps) => {
  const [username, setUsername] = useState<string | null | undefined>(inputUsername);
  const [resetInitiated, setResetInitiated] = useState<boolean>(Boolean(resetToken));
  const onResetInitiated = (username: string) => {
    setResetInitiated(true);
    setUsername(username);
  };
  return resetInitiated ? (
    <PasswordResetForm username={username!} resetToken={resetToken} onClose={onClose} />
  ) : (
    <InitiateResetForm username={username} setUsername={onResetInitiated} onClose={onClose} />
  );
};

type InitiateResetFormProps = {
  username?: string | null;
  setUsername: (username: string) => void;
  onClose: () => void;
};
const InitiateResetForm = ({ setUsername, username }: InitiateResetFormProps) => {
  const { register } = useForm();
  return (
    <FormContainer
      onSuccess={({ username }) => {
        setUsername(username);
        const reqBody: BasicUserIdRequest = {
          id: username,
        };
        fetch(`${API_URL}/auth/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(reqBody),
        });
      }}
      defaultValues={{ username: username || "" }}
    >
      <Stack sx={{ gap: 2, paddingTop: 2 }}>
        <TextFieldElement label="Username" {...register("username")} />
        <Button type="submit">Reset Password</Button>
      </Stack>
    </FormContainer>
  );
};

const resetPasswordSchema = z
  .object({
    resetToken: z.string(),
    newPassword: Password,
    newPasswordVerify: Password,
  })
  .refine((data) => data.newPassword === data.newPasswordVerify, {
    message: "Passwords must match",
    path: ["newPasswordVerify"],
  });
export type PasswordResetFormProps = {
  username: string;
  resetToken?: string | null;
  onClose: () => void;
};
export const PasswordResetForm = ({ username, resetToken, onClose }: PasswordResetFormProps) => {
  const [error, setError] = useState<string | null>(null);
  const [tokenState, setTokenState] = useState<"valid" | "invalid" | "checking" | null>(resetToken ? "checking" : null);
  useEffect(() => {
    if (resetToken) {
      const validateResetTokenBody: ValidateResetTokenRequest = {
        userId: username,
        resetToken: resetToken,
      };
      postJson(`${API_URL}/auth/validate-reset-token`, validateResetTokenBody).then((data) => {
        const result = parseResponseBody(data, ValidateResetTokenResponse);
        if (result.data?.valid) {
          setTokenState("valid");
        } else {
          setTokenState("invalid");
        }
      });
    }
  }, [resetToken, username]);
  const { register } = useForm();
  return tokenState === "invalid" ? (
    <Typography color="error">Reset token invalid or expired</Typography>
  ) : tokenState === "checking" ? (
    <Typography>Checking reset token...</Typography>
  ) : (
    <FormContainer
      onSuccess={(data) => {
        const changePasswordRequest: ChangePasswordRequest = {
          userId: username,
          resetToken: data.resetToken,
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
              onClose();
            } else {
              setError("Reset token invalid or expired");
            }
          })
          .catch((error) => {
            setError("Reset token invalid or expired");
          });
      }}
      resolver={zodResolver(resetPasswordSchema)}
      defaultValues={{ username: username || "", resetToken: resetToken || "", newPassword: "", newPasswordVerify: "" }}
    >
      <Stack sx={{ gap: 2, paddingTop: 2 }}>
        <PasswordElement label="Password Reset Token" {...register("resetToken")} disabled={Boolean(resetToken)} />
        <PasswordElement label="New Password" {...register("newPassword")} />
        <PasswordElement label="Re-enter New Password" {...register("newPasswordVerify")} />
        {error && <Typography color="error">{error}</Typography>}
        <Button type="submit">Change Password</Button>
      </Stack>
    </FormContainer>
  );
};
