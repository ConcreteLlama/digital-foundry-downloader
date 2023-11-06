import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { ContentDetectionConfig } from "df-downloader-common/config/content-detection-config";

export const ContentDetectionSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="contentDetection" title="Content Detection">
      <ZodNumberField
        name="contentCheckInterval"
        label="Content Check Interval"
        helperText="How frequently to check for new content (in milliseconds)"
        zodNumber={ContentDetectionConfig.shape.contentCheckInterval._def.innerType}
      />
      <ZodNumberField
        name="maxArchivePage"
        label="Max Archive Page"
        helperText="Maximum number of pages to scan on the DF site. Infinite if unset"
        zodNumber={ContentDetectionConfig.shape.maxArchivePage._def.innerType}
      />
    </DfSettingsSectionForm>
  );
};
