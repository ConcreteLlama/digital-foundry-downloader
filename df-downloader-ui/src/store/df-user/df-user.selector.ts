import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";

const selectSelf = (state: RootState) => state.dfUserInfo;

export const selectDfUserInfo = createSelector(selectSelf, (userState) => userState.userInfo);
export const selectDfUserInfoInitialized = createSelector(selectSelf, (userState) => userState.initialized);
