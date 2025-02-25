import { z } from "zod";

export const UserInfo = z.object({
  lastVersionAcknowledged: z.string().optional(),
});
export type UserInfo = z.infer<typeof UserInfo>;

export const UserAuthenticationInfo = z.object({
  secretHash: z.string(),
});
export type UserAuthenticationInfo = z.infer<typeof UserAuthenticationInfo>;

export const UserRole = z.enum(["admin", "user"]);
export type UserRole = z.infer<typeof UserRole>;
export const UserAuthorizationInfo = z.object({
  role: UserRole,
});
export type UserAuthorizationInfo = z.infer<typeof UserAuthorizationInfo>;

export const User = z.object({
  id: z.string(),
  userInfo: UserInfo,
  authorization: UserAuthorizationInfo,
});
export type User = z.infer<typeof User>;

export const UserEntity = User.extend({
  authentication: UserAuthenticationInfo,
});
export type UserEntity = z.infer<typeof UserEntity>;

export const UserUtils = {
  toUser(userEntity: UserEntity): User {
    return {
      id: userEntity.id,
      userInfo: userEntity.userInfo,
      authorization: userEntity.authorization,
    };
  },
};

export const BasicUserIdRequest = z.object({
  id: z.string(),
});
export type BasicUserIdRequest = z.infer<typeof BasicUserIdRequest>;

export const UpdateUserInfoRequest = z.object({
  userId: z.string(),
  userInfo: UserInfo.partial(),
});
export type UpdateUserInfoRequest = z.infer<typeof UpdateUserInfoRequest>;

export const UpdateUserInfoResponse = z.object({
  userId: z.string(),
  updatedUserInfo: UserInfo,
});
export type UpdateUserInfoResponse = z.infer<typeof UpdateUserInfoResponse>;