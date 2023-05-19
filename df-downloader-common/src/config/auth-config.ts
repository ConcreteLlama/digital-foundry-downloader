import { z } from "zod";

export const PasswordResetConfig = z.object({
  resetTokenValidity: z.number().min(60000, "Reset token validity must be at least 1 minute").default(60000),
});
export type PasswordResetConfig = z.infer<typeof PasswordResetConfig>;

export const AuthenticationConfig = z.object({
  passwordReset: PasswordResetConfig,
});
export type AuthenticationConfig = z.infer<typeof AuthenticationConfig>;
export const AuthenticationConfigKey = "authentication";

export const DefaultAuthenticationConfig: AuthenticationConfig = {
  passwordReset: {
    resetTokenValidity: 60000,
  },
};
