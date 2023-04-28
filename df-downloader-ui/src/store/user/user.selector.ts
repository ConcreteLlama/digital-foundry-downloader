import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";

const selectSelf = (state: RootState) => state.userInfo;

export const selectUserInfo = createSelector(selectSelf, (userState) => userState.userInfo);
