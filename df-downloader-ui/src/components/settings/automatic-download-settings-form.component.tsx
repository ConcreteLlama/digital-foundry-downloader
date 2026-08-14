import { AutomaticDownloadsConfig } from "df-downloader-common/config/automatic-downloads-config";
import { Fragment } from "react";
import { CheckboxElement, useWatch } from "react-hook-form-mui";
import { FilterList } from "../general/filters/filter-list.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
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
      <CheckboxElement
        name="enabled"
        label="Enable Automatic Downloads"
        helperText="Whether automatic downloads are enabled"
      />
      {enabled && (
        <Fragment>
          <ZodNumberField
            name="downloadDelayMinMs"
            label="Download Delay - Minimum"
            helperText="Minimum delay after detecting new content before starting the download (in milliseconds). A random value between the minimum and maximum is picked for each piece of content, so multiple installations don't all start downloading from Digital Foundry's CDN at the same instant."
            zodNumber={AutomaticDownloadsConfig.shape.downloadDelayMinMs._def.innerType}
          />
          <ZodNumberField
            name="downloadDelayMaxMs"
            label="Download Delay - Maximum"
            helperText="Maximum delay after detecting new content before starting the download (in milliseconds)."
            zodNumber={AutomaticDownloadsConfig.shape.downloadDelayMaxMs._def.innerType}
          />
          <ZodNumberField
            name="maxContentAgeHours"
            label="Max Content Age (hours)"
            helperText="Only auto-download content published within this many hours (max 168 = 1 week). Older content is still added to the list, just not auto-downloaded - protects against a flood of downloads if a lot of 'new' content is ever discovered at once."
            zodNumber={AutomaticDownloadsConfig.shape.maxContentAgeHours._def.innerType}
          />
          <FilterList filterName="Exclusion" fieldArrayName="exclusionFilters" />
        </Fragment>
      )}
    </Fragment>
  );
};
