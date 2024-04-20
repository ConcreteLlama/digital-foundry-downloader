import { RootState } from "../store";
import { createDeepEqualSelector, createShallowEqualSelector } from "../utils.ts";

const selectSelf = (state: RootState) => state.serviceInfo;

export const selectServiceInfo = createDeepEqualSelector(selectSelf, (serviceState) => serviceState.serviceInfo);
export const selectServiceError = createShallowEqualSelector(selectSelf, (serviceState) => serviceState.error);
