export enum DfUiErrorCode {
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  FETCH_ERROR = "FETCH_ERROR",
  PARSE_ERROR = "PARSE_ERROR",
}

// Custom error interface
export interface DfUiError {
  message: string;
  code: string;
  details?: any;
}

export const isDfUiError = (error: any): error is DfUiError => {
  return error && error.message && error.code;
};

export const ensureDfUiError = (error: any): DfUiError => {
  if (isDfUiError(error)) {
    return error;
  }
  return createDfUiError(error);
};

// Error generator function
export const createDfUiError = (error: any, defaultErrorCode?: DfUiErrorCode): DfUiError => {
  return {
    message: error.message || "An unknown error occurred.",
    code: error.code || defaultErrorCode || DfUiErrorCode.UNKNOWN_ERROR,
  };
};

// Generic error wrapper function
export const wrapWithErrorHandling = async <T>(
  func: () => T | Promise<T>,
  defaultErrorCode?: DfUiErrorCode
): Promise<T> => {
  try {
    const result = await func();
    return result;
  } catch (e) {
    throw createDfUiError(e, defaultErrorCode);
  }
};
