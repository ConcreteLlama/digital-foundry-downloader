import { z } from "zod";
import { DfUserInfo } from "./df-user-info.js";

export const SignUpRequest = z.object({
  userInfo: DfUserInfo,
  password: z.string(),
});

export const SignUpResponse = z.object({
  userInfo: DfUserInfo,
});

export const SignInRequest = z.object({
  id: z.string(),
  password: z.string(),
});

export const SignInResponse = z.object({
  userInfo: DfUserInfo,
});
