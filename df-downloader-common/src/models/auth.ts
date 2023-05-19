import { z } from "zod";

export const AuthErrorResponseReason = z.enum(["invalid-token", "token-expired", "no-token"]);
export type AuthErrorResponseReason = z.infer<typeof AuthErrorResponseReason>;

export const Password = z.string().min(8, "Password must be at least 8 characters long");

export const AuthErrorResponseData = z.object({
  reason: AuthErrorResponseReason,
  registrationAvailable: z.boolean().optional(),
});
export type AuthErrorResponseData = z.infer<typeof AuthErrorResponseData>;

export const ChangePasswordRequest = z
  .object({
    userId: z.string().optional(),
    resetToken: z.string().optional(),
    oldPassword: z.string().optional(),
    newPassword: Password,
  })
  .refine((data) => {
    return (data.resetToken && data.userId && !data.oldPassword) || (!data.resetToken && data.oldPassword);
  }, "Either resetToken with userId or oldPassword must be provided");
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const ValidateResetTokenRequest = z.object({
  userId: z.string(),
  resetToken: z.string(),
});
export type ValidateResetTokenRequest = z.infer<typeof ValidateResetTokenRequest>;

export const ValidateResetTokenResponse = z.object({
  valid: z.boolean(),
});
export type ValidateResetTokenResponse = z.infer<typeof ValidateResetTokenResponse>;
