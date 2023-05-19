import { DfUiErrorCode, createDfUiError, wrapWithErrorHandling } from "./error";

export function postJson(input: RequestInfo, body: any): Promise<any> {
  return fetchJson(input, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
// Fetch with JSON function
export async function fetchJson(input: RequestInfo, init: RequestInit = {}): Promise<any> {
  const response = await wrapWithErrorHandling(
    () =>
      fetch(input, {
        credentials: "include",
        ...init,
      }),
    DfUiErrorCode.FETCH_ERROR
  );
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {}
    if (errorData?.error) {
      throw createDfUiError(errorData.error, DfUiErrorCode.FETCH_ERROR);
    }
    throw createDfUiError(`HTTP error ${response.status}: ${response.statusText}`, DfUiErrorCode.FETCH_ERROR);
  }
  const data = await wrapWithErrorHandling(() => response.json(), DfUiErrorCode.PARSE_ERROR);
  return data;
}
