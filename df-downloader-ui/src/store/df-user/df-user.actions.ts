import { DfUserInfo } from "df-downloader-common";
import { createQueryActions } from "../utils";

// Signed-out is a normal, expected result here (no/invalid autologin cookie),
// and the service represents it as a success response with no user payload -
// so the success value is DfUserInfo | undefined, not just DfUserInfo. This
// matters for clearing a previously-cached (possibly stale) signed-in state
// back to "not signed in" when a later poll finds we're no longer authed.
export const queryDfUserInfo = createQueryActions<void, DfUserInfo | undefined>("dfUserInfo", "QUERY_USER_INFO");
