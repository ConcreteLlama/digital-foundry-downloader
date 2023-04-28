import { PasswordElement } from "react-hook-form-mui";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const DfSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="digitalFoundry" title="Digital Foundry">
      <PasswordElement name="sessionId" label="Session ID" />
    </DfSettingsSectionForm>
  );
};
