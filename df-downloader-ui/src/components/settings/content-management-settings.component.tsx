import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { ContentManagementConfig } from "df-downloader-common/config/content-management-config";
import { CheckboxElement } from "react-hook-form-mui";
import { ZodTextField } from "../zod-fields/zod-text-field.component";

export const ContentManagementSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="contentManagement" title="Content Management Settings">
      <CheckboxElement
        name="scanForExistingFiles"
        label="Scan for existing files"
        helperText="Enable to scan for existing files on startup"
      />
      <ZodTextField
        name="destinationDir"
        label="Destination Directory"
        helperText="The directory where downloaded content will be saved"
        zodString={ContentManagementConfig.shape.destinationDir._def.innerType}
      />
      <ZodTextField
        name="workDir"
        label="Work Directory"
        helperText="The directory where content is processed (e.g. downloaded, injected with metadata, etc.)"
        zodString={ContentManagementConfig.shape.workDir._def.innerType}
      />
    </DfSettingsSectionForm>
  );
};
