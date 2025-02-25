import { UserEntity, UserInfo } from "df-downloader-common/";

export interface UserService {
  getUser(id: string): UserEntity | undefined | Promise<UserEntity | undefined>;
  hasUsers(): boolean | Promise<boolean>;
  createUser(user: UserEntity): void | Promise<void>;
  updateUser(userId: string, user: Partial<UserEntity>): UserEntity | Promise<UserEntity>;
  updateUserInfo(userId: string, userInfo: Partial<UserInfo>): UserEntity | Promise<UserEntity>;
  deleteUser(id: string): void | Promise<void>;
}
