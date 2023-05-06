import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";

const selectSelf = (state: RootState) => state.serviceInfo;

export const selectServiceInfo = createSelector(selectSelf, (serviceState) => serviceState.serviceInfo);
