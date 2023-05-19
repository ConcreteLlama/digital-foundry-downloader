import { AuthErrorResponseData, EmptyResponseData, User, UserInfo } from "df-downloader-common";
import { createQueryActions } from "../utils";

export const queryCurrentUser = createQueryActions<void, User>("authUser", "QUERY_CURRENT_USER");
export const login = createQueryActions<{ username: string; password: string }, User>("authUser", "LOGIN");
export const logout = createQueryActions<void, EmptyResponseData>("authUser", "LOGOUT");
export const register = createQueryActions<
  { username: string; password: string; userInfo: UserInfo },
  User,
  AuthErrorResponseData
>("authUser", "REGISTER");
