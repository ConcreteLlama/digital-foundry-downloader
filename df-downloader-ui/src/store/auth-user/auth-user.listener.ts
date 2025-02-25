import { EmptyResponseData, UpdateUserInfoResponse, User } from "df-downloader-common";
import { API_URL } from "../../config";
import { AppStartListening } from "../listener";
import { addFetchListener } from "../utils";
import { login, logout, queryCurrentUser, register, updateUserInfo } from "./auth-user.actions";
import { makeBasicAuth } from "./utils";

export const startListeningAuthUser = (listener: AppStartListening) => {
  addFetchListener(listener, queryCurrentUser, User, () => [
    `${API_URL}/auth/users/me`,
    {
      credentials: "include",
    },
  ]);
  addFetchListener(listener, login, User, ({ username, password }) => [
    `${API_URL}/auth/login`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: makeBasicAuth(username, password),
      },
    },
  ]);
  addFetchListener(listener, register, User, ({ username, password, userInfo }) => [
    `${API_URL}/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: makeBasicAuth(username, password),
      },
      body: JSON.stringify(userInfo),
    },
  ]);
  addFetchListener(listener, logout, EmptyResponseData, () => [
    `${API_URL}/auth/logout`,
    {
      method: "POST",
      credentials: "include",
    },
  ]);
  addFetchListener(listener, updateUserInfo, UpdateUserInfoResponse, (userInfoReq) => [
    `${API_URL}/user`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userInfoReq),
    },
  ]);
};
