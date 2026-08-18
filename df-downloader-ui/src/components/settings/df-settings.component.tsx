import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfConfig } from "df-downloader-common/config/df-config";
import { Alert, Box, Button, Link, List, ListItem, ListItemText, ListSubheader } from "@mui/material";
import { fetchJson } from "../../utils/fetch";
import { API_URL } from "../../config";
import { store } from "../../store/store";
import { queryDfUserInfo } from "../../store/df-user/df-user.actions";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { DfUserInfo, TestSessionIdRequest, parseResponseBody } from "df-downloader-common";
import { queryDfContent } from "../../store/df-content/df-content.action";
import { ensureDfUiError } from "../../utils/error";

export const DfSettingsForm = () => {
  return (
    <DfSettingsSectionForm
      sectionName="digitalFoundry"
      title="Digital Foundry"
      onSubmit={() => {
        // /df-user/await-login blocks (up to its own timeout) until the
        // service has actually confirmed the newly-saved cookie against
        // digitalfoundry.net, so its response is the authoritative answer -
        // dispatch it directly rather than firing a second, separate
        // queryDfUserInfo request afterwards. That second request used to
        // race the background self-correcting poll in App.tsx (whichever
        // resolved last would win, regardless of which was more recent),
        // which could flicker the "Not Connected" dialog back open even
        // after a valid session ID was confirmed (confirmed live
        // 2026-08-18). Dispatching `start` up front also sets `loading`,
        // which the background poll checks before firing a competing
        // request of its own.
        store.dispatch(queryDfUserInfo.start());
        fetchJson(`${API_URL}/df-user/await-login`, { method: "GET" })
          .then((data) => {
            const result = parseResponseBody(data, DfUserInfo.optional());
            if (result.error) {
              store.dispatch(queryDfUserInfo.failed(ensureDfUiError(result.error)));
            } else {
              store.dispatch(queryDfUserInfo.success(result.data));
            }
          })
          .catch((e) => {
            store.dispatch(queryDfUserInfo.failed(ensureDfUiError(e)));
          })
          .finally(() => {
            store.dispatch(queryDfContent.start());
          });
      }}
    >
      <DfSessionIdField />
      <List>
        <ListSubheader>Acquiring your autologin cookie</ListSubheader>
        <ListItem>
          <ListItemText>
            1. Go to <Link href="https://www.digitalfoundry.net">digitalfoundry.net</Link>
          </ListItemText>
        </ListItem>
        <ListItem>
          <ListItemText>2. Sign in using the normal method</ListItemText>
        </ListItem>
        <ListItem>
          <ListItemText>3. Once signed in, open the developer tools in your browser</ListItemText>
        </ListItem>
        <ListItem>
          <ListItemText>
            4. Find cookies for the site - in Chrome, for example, this will be in the "Application" tab and under the
            "Storage" section. If you expand "Cookies" you will see an item for digitalfoundry.net
          </ListItemText>
        </ListItem>
        <ListItem>
          <ListItemText>5. Copy the value of the "autologin" cookie</ListItemText>
        </ListItem>
      </List>
    </DfSettingsSectionForm>
  );
};

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success"; username: string }
  | { status: "error"; message: string };

const DfSessionIdField = () => {
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const sessionIdValue = useWatch({
    name: `sessionId`,
  });
  const buttonLabel =
    testState.status === "testing"
      ? "Testing…"
      : testState.status === "success"
        ? testState.username
        : testState.status === "error"
          ? "Test Failed - Retry"
          : "Test Session ID";
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
        <ZodTextField
          name="sessionId"
          label="Autologin Cookie"
          isPassword={true}
          zodString={DfConfig.shape.sessionId._def.innerType}
          helperText="Paste the value of the 'autologin' cookie from your browser after signing in to digitalfoundry.net"
          onChange={() => setTestState({ status: "idle" })}
        />
        <Button
          sx={{ bgcolor: testState.status === "error" ? "error.main" : "default", width: 200 }}
          // Allow re-testing after a failure (so the user can retry once they
          // paste a corrected cookie); only block while a test is in flight or
          // after a confirmed success.
          disabled={!sessionIdValue || testState.status === "testing" || testState.status === "success"}
          variant="contained"
          onClick={() => testSessionId(sessionIdValue, setTestState)}
        >
          {buttonLabel}
        </Button>
      </Box>
      {testState.status === "error" && <Alert severity="error">{testState.message}</Alert>}
      {testState.status === "success" && (
        <Alert severity="success">Signed in as {testState.username}</Alert>
      )}
    </Box>
  );
};

const testSessionId = async (sessionId: string, setState: (state: TestState) => void) => {
  setState({ status: "testing" });
  try {
    const requestBody: TestSessionIdRequest = {
      sessionId,
    };
    const data = await fetchJson(`${API_URL}/df-user/test-session-id`, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json",
      },
    });
    // The endpoint reports an invalid cookie as {success:false, error} with an
    // HTTP 200, so fetchJson doesn't throw for it - surface the actual error
    // message rather than silently swallowing it (previously this just flipped
    // the button red with no explanation).
    const result = parseResponseBody(data, DfUserInfo);
    if (result.data) {
      setState({ status: "success", username: result.data.username });
    } else {
      setState({ status: "error", message: result.error?.message || "Invalid session ID" });
    }
  } catch (e: any) {
    setState({ status: "error", message: e?.message || "Failed to test session ID" });
  }
};
