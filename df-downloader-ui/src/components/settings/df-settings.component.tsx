import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfConfig } from "df-downloader-common/config/df-config";
import { Box, Button, Link, List, ListItem, ListItemText, ListSubheader } from "@mui/material";
import { fetchJson } from "../../utils/fetch";
import { API_URL } from "../../config";
import { store } from "../../store/store";
import { queryDfUserInfo } from "../../store/df-user/df-user.actions";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { DfUserInfo, TestSessionIdRequest, parseResponseBody } from "df-downloader-common";

export const DfSettingsForm = () => {
  return (
    <DfSettingsSectionForm
      sectionName="digitalFoundry"
      title="Digital Foundry"
      onSubmit={() => {
        fetchJson(`${API_URL}/df-user/await-login`, { method: "GET" }).then(() => {
          store.dispatch(queryDfUserInfo.start());
        });
      }}
    >
      <DfSessionIdField />
      <List>
        <ListSubheader>Acquiring your sessionid cookie</ListSubheader>
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
          <ListItemText>5. Copy the value of the "sessionid" cookie - NOT the "session_id" cookie</ListItemText>
        </ListItem>
      </List>
    </DfSettingsSectionForm>
  );
};

const DfSessionIdField = () => {
  const [testResult, setTestResult] = useState<string | false | null>(null);
  const sessionIdValue = useWatch({
    name: `sessionId`,
  });
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <ZodTextField
        name="sessionId"
        label="Session ID"
        isPassword={true}
        zodString={DfConfig.shape.sessionId._def.innerType}
        helperText="To acquire your DF Session ID, you'll need to extract the sessionid cookie from your browser (NOT the session_id cookie)"
        onChange={() => setTestResult(null)}
      />
      <Button
        sx={{ bgcolor: testResult === false ? "error.main" : "default", width: 200 }}
        disabled={!sessionIdValue || Boolean(testResult)}
        variant="contained"
        onClick={() => testSessionId(sessionIdValue, setTestResult)}
      >
        {testResult === null ? "Test Session ID" : testResult ? `${testResult}` : "Test Session ID Failed"}
      </Button>
    </Box>
  );
};

const testSessionId = async (sessionId: string, setResult: (result: string | null | false) => void) => {
  setResult(null);
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
  const result = parseResponseBody(data, DfUserInfo);
  if (result.data) {
    setResult(result.data.username);
  } else {
    setResult(false);
  }
};
