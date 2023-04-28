import { CheckboxElement } from "react-hook-form-mui";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const MetadataSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="metadata" title="Metadata">
      <CheckboxElement
        name="injectMetadata"
        label="Inject Metadata After Downloading"
        helperText="Set this to inject metadata into the file after downloading content - this includes title, description, and tags (as genre tags)"
      />
    </DfSettingsSectionForm>
  );
};
