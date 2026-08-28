import { ContentManagementConfig } from "df-downloader-common/config/content-management-config";
import { useSelector } from "react-redux";
import { selectServiceInfo } from "../../store/service-info/service-info.selector";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component.tsx";
import { ZodNumberField } from "../zod-fields/zod-number-field.component.tsx";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { getZodDescription } from "../zod-fields/zod-schema-utils.ts";
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
    <ZodCheckboxField
      name="scanForExistingFiles"
      label="Scan for existing files"
      zodBoolean={ContentManagementConfig.shape.scanForExistingFiles}
    />
    <ZodNumberField
      name="maxScanDepth"
      label="Maximum Scan Depth"
      zodNumber={ContentManagementConfig.shape.maxScanDepth}
    />
    <ZodTextField
      name="destinationDir"
      label="Destination Directory"
      helperText={`${getZodDescription(ContentManagementConfig.shape.destinationDir) ?? ""}${isContainer ? " Disabled when running in a container - map the /destination_dir container path instead." : ""
        }`}
      disabled={isContainer}
      zodString={ContentManagementConfig.shape.destinationDir}
    />
    <TemplateBuilderField/>
    <ZodTextField
      name="workDir"
      label="Work Directory"
      helperText={`${getZodDescription(ContentManagementConfig.shape.workDir) ?? ""}${isContainer ? " Disabled when running in a container - map the /work_dir container path instead." : ""
        }`}
      disabled={isContainer}
      zodString={ContentManagementConfig.shape.workDir}
    />
  </ >
  );
};
