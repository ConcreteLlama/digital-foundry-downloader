import { Fragment } from "react";
import { OrderableListFormField } from "../general/ordered-list-form-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { AutomaticDownloadsConfig } from "df-downloader-common/config/automatic-downloads-config";
import { FilterList } from "../general/filters/filter-list.component";
import { CheckboxElement, useWatch } from "react-hook-form-mui";

export const AutomaticDownloadsSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="automaticDownloads" title="Automatic Downloads">
      <AutoConfigSettings />
    </DfSettingsSectionForm>
  );
};

const AutoConfigSettings = () => {
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
            name="downloadDelay"
            label="Download Delay"
            helperText="Delay after detecting new content before starting the download (in milliseconds)"
            zodNumber={AutomaticDownloadsConfig.shape.downloadDelay._def.innerType}
          />
          <OrderableListFormField name="mediaTypes" label="Media Type Priorities" extendable={false} />
          <FilterList type="exclude" />
        </Fragment>
      )}
    </Fragment>
  );
};
