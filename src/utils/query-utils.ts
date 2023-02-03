import { commaSeparatedToArray } from "./string-utils.js";

export const queryParamToString = (queryParam: any) => {
  return typeof queryParam === "string" ? queryParam : undefined;
};

export const queryParamToInteger = (queryParam: any) => {
  return parseInt(queryParamToString(queryParam)!) || undefined;
};

export const queryParamToStringArray = (queryParam: any) => {
  if (typeof queryParam === "string") {
    return commaSeparatedToArray(queryParam);
  } else if (Array.isArray(queryParam)) {
    return queryParam.filter((qp) => typeof qp === "string");
  }
};
