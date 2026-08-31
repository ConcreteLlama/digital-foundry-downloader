import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { ZodDurationField } from "../zod-fields/zod-duration-field.component";
import { ContentDetectionConfig } from "df-downloader-common/config/content-detection-config";

export const ContentDetectionSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="contentDetection" title="Content Detection">
      <ZodDurationField
        name="contentCheckInterval"
        label="Content Check Interval"
        zodNumber={ContentDetectionConfig.shape.contentCheckInterval}
      />
      <ZodNumberField
        name="maxArchivePage"
        label="Max Archive Page"
        zodNumber={ContentDetectionConfig.shape.maxArchivePage}
      />
    </DfSettingsSectionForm>
  );
};
