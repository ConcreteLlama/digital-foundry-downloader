import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { LoginForm } from "./login-form.component";
import { selectCanRegister } from "../../store/auth-user/auth-user.selector";
import { useSelector } from "react-redux";
import { RegistrationForm } from "./registration-form.component";
import { useEffect, useState } from "react";
import { ResetPasswordForm } from "./reset-password-form.component";
import { useNavigate, useSearchParams } from "react-router-dom";

export const AuthFormDialog = () => {
  const canRegister = useSelector(selectCanRegister);
  const [searchParams] = useSearchParams();
  const username = searchParams.get("username");
  const resetToken = searchParams.get("resetToken");
  const [mode, setMode] = useState<"login" | "register" | "reset-password">(canRegister ? "register" : resetToken ? "reset-password" : "login");
  useEffect(() => {
    setMode(canRegister ? "register" : resetToken ? "reset-password" : "login");
  }, [canRegister, resetToken]);
  const navigate = useNavigate();
  const onClose = () => {
    navigate("/");
    setMode("login");
  };
  return (
    <Dialog open={true} fullWidth maxWidth={"lg"} id="auth-form-dialog">
      <DialogTitle>
        <Typography>Login</Typography>
      </DialogTitle>
      <DialogContent>
        {mode === "register" ? (
          <RegistrationForm username={username} />
        ) : mode === "login" ? (
          <LoginForm username={username} />
        ) : (
          <ResetPasswordForm username={username} resetToken={resetToken} onClose={onClose} />
        )}
      </DialogContent>
      <DialogActions>
        {mode === "login" && <Button onClick={() => setMode("reset-password")}>Forgot your password?</Button>}
        {mode === "reset-password" && <Button onClick={() => onClose()}>Cancel</Button>}
      </DialogActions>
    </Dialog>
  );
};
