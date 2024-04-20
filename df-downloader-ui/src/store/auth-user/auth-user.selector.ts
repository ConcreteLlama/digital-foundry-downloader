import { createSelector } from "reselect";
import { RootState } from "../store";
import { createDeepEqualSelector, createShallowEqualSelector } from "../utils.ts";

const selectSelfLogin = (state: RootState) => state.authUser;

export const selectAuthUser = createDeepEqualSelector(selectSelfLogin, (authUserState) => authUserState.user);
export const selectCanRegister = createSelector(selectSelfLogin, (authUserState) => authUserState.canRegister);
export const selectLoginError = createShallowEqualSelector(
  selectSelfLogin,
  (authUserState) => authUserState.loginError
);
