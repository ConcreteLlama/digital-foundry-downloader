import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { ContentManagementConfig } from "df-downloader-common/config/content-management-config";
import { CheckboxElement } from "react-hook-form-mui";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { useSelector } from "react-redux";
import { selectServiceInfo } from "../../store/service-info/service-info.selector";

export const ContentManagementSettingsForm = () => {
  const serviceInfo = useSelector(selectServiceInfo);
  const isContainer = serviceInfo ? serviceInfo.isContainer : true;
  return (
    <DfSettingsSectionForm sectionName="contentManagement" title="Content Management Settings">
      <CheckboxElement
        name="scanForExistingFiles"
        label="Scan for existing files"
        helperText="Enable to scan for existing files on startup"
      />
      <ZodTextField
        name="destinationDir"
        label={`Destination Directory${
          isContainer ? " (disabled if running in container; map the /destination_dir container path)" : ""
        }`}
        helperText="The directory where downloaded content will be saved"
        disabled={isContainer}
        zodString={ContentManagementConfig.shape.destinationDir._def.innerType}
      />
      <ZodTextField
        name="workDir"
        label={`Work Directory${
          isContainer ? " (disabled if running in container; map the /destination_dir container path)" : ""
        }`}
        helperText="The directory where content is processed (e.g. downloaded, injected with metadata, etc.)"
        disabled={isContainer}
        zodString={ContentManagementConfig.shape.workDir._def.innerType}
      />
    </DfSettingsSectionForm>
  );
};
