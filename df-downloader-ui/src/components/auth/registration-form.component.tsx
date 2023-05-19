import { Button, Stack, Typography } from "@mui/material";
import { register as registerAction } from "../../store/auth-user/auth-user.actions";
import { store } from "../../store/store";
import { useForm } from "react-hook-form";
import { FormContainer, PasswordElement, TextFieldElement } from "react-hook-form-mui";

export type RegistrationFormProps = {
  username?: string | null;
};
export const RegistrationForm = ({ username }: RegistrationFormProps) => {
  const { register } = useForm();
  return (
    <FormContainer
      onSuccess={({ username, password }) =>
        store.dispatch(
          registerAction.start({
            username,
            password,
            userInfo: {},
          })
        )
      }
      defaultValues={{ username: username || "", password: "" }}
    >
      <Stack sx={{ gap: 2, paddingTop: 2 }}>
        <Typography>
          Looks like this is your first time here! To get going, you'll need to setup a username and password
        </Typography>
        <TextFieldElement label="Username" value={username} {...register("username")} />
        <PasswordElement label="Password" {...register("password")} />
        <Button type="submit">Register</Button>
      </Stack>
    </FormContainer>
  );
};
