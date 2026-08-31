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

/**
 * A query-string flag.
 *
 * "?flag" with no value is a present flag and reads as true, since that is
 * what anyone hand-writing the URL means by it. Only an explicit "false" or
 * "0" turns it off; anything absent stays undefined so a caller can tell
 * "not asked for" from "asked for, off".
 */
export const queryParamToBoolean = (queryParam: any): boolean | undefined => {
  const value = queryParamToString(queryParam);
  if (value === undefined) {
    return undefined;
  }
  if (value === "" ) {
    return true;
  }
  const lowered = value.toLowerCase();
  return lowered !== "false" && lowered !== "0";
};
