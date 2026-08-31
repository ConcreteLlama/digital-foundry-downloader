import { AutomaticDownloadsConfig } from "df-downloader-common/config/automatic-downloads-config";
import { Fragment } from "react";
import { useWatch } from "react-hook-form-mui";
import { FilterList } from "../general/filters/filter-list.component";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { ZodDurationField } from "../zod-fields/zod-duration-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const AutomaticDownloadsSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="automaticDownloads" title="Automatic Downloads">
      <AutomaticDownloadConfigSettings />
    </DfSettingsSectionForm>
  );
};

const AutomaticDownloadConfigSettings = () => {
  const enabled = useWatch<AutomaticDownloadsConfig>({
    name: "enabled",
  });
  return (
    <Fragment>
      <ZodCheckboxField
        name="enabled"
        label="Enable Automatic Downloads"
        zodBoolean={AutomaticDownloadsConfig.shape.enabled}
      />
      {enabled && (
        <Fragment>
          <ZodDurationField
            name="downloadDelayMinMs"
            label="Download Delay - Minimum"
            zodNumber={AutomaticDownloadsConfig.shape.downloadDelayMinMs}
          />
          <ZodDurationField
            name="downloadDelayMaxMs"
            label="Download Delay - Maximum"
            zodNumber={AutomaticDownloadsConfig.shape.downloadDelayMaxMs}
          />
          <ZodNumberField
            name="maxContentAgeHours"
            label="Max Content Age (hours)"
            zodNumber={AutomaticDownloadsConfig.shape.maxContentAgeHours}
          />
          <FilterList filterName="Exclusion" fieldArrayName="exclusionFilters" />
        </Fragment>
      )}
    </Fragment>
  );
};
