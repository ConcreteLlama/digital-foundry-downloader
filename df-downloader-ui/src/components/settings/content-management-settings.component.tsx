import { ContentManagementConfig } from "df-downloader-common/config/content-management-config";
import { testTemplate, TestTemplateError } from "df-downloader-common/utils/filename-template-utils";
import { useEffect, useState } from "react";
import { CheckboxElement, TextFieldElement, useWatch } from "react-hook-form-mui";
import { useSelector } from "react-redux";
import { selectServiceInfo } from "../../store/service-info/service-info.selector";
import { ZodNumberField } from "../zod-fields/zod-number-field.component.tsx";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

type TemplateExample = {
  value: string;
  unknownVarMessage?: string;
  error?: any;
}
const makeTemplateExample = (filenameTemplate: string, currentValue?: TemplateExample | null): TemplateExample => {
  try {
    return {
      value: testTemplate(filenameTemplate)
    }
  } catch (e: any) {
    if (e instanceof TestTemplateError) {
      if (e.reason === 'unknown-var') {
        return {
          value: "",
          unknownVarMessage: e.message
        }
      }
    }
    return {
      value: currentValue?.value || "",
      error: e
    }
  }
}

export const ContentManagementSettingsForm = () => {
  return <DfSettingsSectionForm sectionName="contentManagement" title="Content Management Settings">
    <ContentManagement />
  </DfSettingsSectionForm>

}

const ContentManagement = () => {
  // How to get current "filenameTemplate" value?
  const filenameTemplate = useWatch({
    name: "filenameTemplate",
  }) as string;
  const [templateExample, setTemplateExample] = useState<TemplateExample | null>();
  const serviceInfo = useSelector(selectServiceInfo);
  const isContainer = serviceInfo ? serviceInfo.isContainer : true;
  useEffect(() => {
    return setTemplateExample(makeTemplateExample(filenameTemplate, templateExample));
  }, [filenameTemplate]);
  const templateHelperText = `${
        templateExample?.value ? `${templateExample.value}` : ""}${
        templateExample?.error ? ` (template currently invalid)` : ""}${
        templateExample?.unknownVarMessage ? `${templateExample.unknownVarMessage}` : ""}`;
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
    <TextFieldElement
      name="filenameTemplate"
      label="Filename Template"
      helperText={templateHelperText}
      autoComplete="off"
      validation={{
        required: "Filename template is required",
        validate: (value: string) => {
          try {
            testTemplate(value);
            return true;
          } catch (e: any) {
            return e.message;
          }
        }
      }}
    />
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
