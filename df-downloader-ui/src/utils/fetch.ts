import { DfUiErrorCode, createDfUiError, wrapWithErrorHandling } from "./error";

// Fetch with JSON function
export async function fetchJson(input: RequestInfo, init?: RequestInit): Promise<any> {
  const response = await wrapWithErrorHandling(() => fetch(input, init), DfUiErrorCode.FETCH_ERROR);
  if (!response.ok) {
    throw createDfUiError(`HTTP error ${response.status}: ${response.statusText}`, DfUiErrorCode.FETCH_ERROR);
  }
  const data = await wrapWithErrorHandling(() => response.json(), DfUiErrorCode.PARSE_ERROR);
  return data;
}
