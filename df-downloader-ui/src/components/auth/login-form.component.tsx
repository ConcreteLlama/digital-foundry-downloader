import { Button, Stack, Typography } from "@mui/material";
import { FormContainer, PasswordElement, TextFieldElement, useForm } from "react-hook-form-mui";
import { useSelector } from "react-redux";
import { login } from "../../store/auth-user/auth-user.actions";
import { selectLoginError } from "../../store/auth-user/auth-user.selector";
import { store } from "../../store/store";

export type LoginFormProps = {
  username?: string | null;
};
export const LoginForm = ({ username }: LoginFormProps) => {
  const { register } = useForm();
  const loginError = useSelector(selectLoginError);
  return (
    <FormContainer
      onSuccess={({ username, password }) =>
        store.dispatch(
          login.start({
            username,
            password,
          })
        )
      }
      defaultValues={{ username: username || "", password: "" }}
    >
      <Stack sx={{ gap: 2, paddingTop: 2 }}>
        <TextFieldElement label="Username" {...register("username")} />
        <PasswordElement label="Password" {...register("password")} />
        {loginError && <Typography color="error">Login Failed</Typography>}
        <Button type="submit">Login</Button>
      </Stack>
    </FormContainer>
  );
};
