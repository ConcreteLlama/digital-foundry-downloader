import { createSelector } from "reselect";
import { RootState } from "../store";

const selectSelfLogin = (state: RootState) => state.authUser;

export const selectAuthUser = createSelector(selectSelfLogin, (authUserState) => authUserState.user);
export const selectCanRegister = createSelector(selectSelfLogin, (authUserState) => authUserState.canRegister);
export const selectLoginError = createSelector(selectSelfLogin, (authUserState) => authUserState.loginError);
