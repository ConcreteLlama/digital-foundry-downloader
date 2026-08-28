import { MetadataConfig } from "df-downloader-common/config/metadata-config";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const MetadataSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="metadata" title="Metadata">
      <ZodCheckboxField
        name="injectMetadata"
        label="Inject Metadata After Downloading"
        zodBoolean={MetadataConfig.shape.injectMetadata}
      />
    </DfSettingsSectionForm>
  );
};
