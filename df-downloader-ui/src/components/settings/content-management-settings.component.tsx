import { ContentManagementConfig } from "df-downloader-common/config/content-management-config";
import { CheckboxElement } from "react-hook-form-mui";
import { useSelector } from "react-redux";
import { selectServiceInfo } from "../../store/service-info/service-info.selector";
import { ZodNumberField } from "../zod-fields/zod-number-field.component.tsx";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { TemplateBuilderField } from "./template/template-builder-field.tsx";

export const ContentManagementSettingsForm = () => {
  return <DfSettingsSectionForm sectionName="contentManagement" title="Content Management Settings">
    <ContentManagement />
  </DfSettingsSectionForm>

}

const ContentManagement = () => {
  const serviceInfo = useSelector(selectServiceInfo);
  const isContainer = serviceInfo ? serviceInfo.isContainer : true;
  return (<>
    <CheckboxElement
      name="scanForExistingFiles"
      label="Scan for existing files"
      helperText="Enable to scan for existing files on startup"
    />
    <ZodNumberField
      name="maxScanDepth"
      label="Maximum Scan Depth"
      helperText="The maximum depth to scan for files in the destination directory"
      zodNumber={ContentManagementConfig.shape.maxScanDepth._def.innerType}
    />
    <ZodTextField
      name="destinationDir"
      label="Destination Directory"
      helperText={`The directory where downloaded content will be saved${isContainer ? " (disabled when running in container; map the /destination_dir container path)" : ""
        }`}
      disabled={isContainer}
      zodString={ContentManagementConfig.shape.destinationDir._def.innerType}
    />
    <TemplateBuilderField/>
    <ZodTextField
      name="workDir"
      label="Work Directory"
      helperText={`The directory where content is processed e.g. downloaded, injected with metadata, etc.${isContainer ? " (disabled when running in container; map the /work_dir container path)" : ""
        }`}
      disabled={isContainer}
      zodString={ContentManagementConfig.shape.workDir._def.innerType}
    />
  </ >
  );
};
