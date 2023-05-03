import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfConfig } from "df-downloader-common/config/df-config";
import { Link, List, ListItem, ListItemText, ListSubheader } from "@mui/material";

export const DfSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="digitalFoundry" title="Digital Foundry">
      <ZodTextField
        name="sessionId"
        label="Session ID"
        isPassword={true}
        zodString={DfConfig.shape.sessionId._def.innerType}
        helperText="To acquire your DF Session ID, you'll need to extract the sessionid cookie from your browser (NOT the session_id cookie)"
      />
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
