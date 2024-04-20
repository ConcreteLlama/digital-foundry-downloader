import { DevConfig } from "df-downloader-common/config/dev-config";
import { CheckboxElement, useWatch } from "react-hook-form-mui";
import { Fragment } from "react/jsx-runtime";
import { ZodTextField } from "../zod-fields/zod-text-field.component.tsx";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const DevSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="dev" title="Dev">
      <DevSettings />
    </DfSettingsSectionForm>
  );
};

const DevSettings = () => {
  const enabled = useWatch<DevConfig>({
    name: "devModeEnabled",
  });
  return (
    <Fragment>
      <CheckboxElement
        name="devModeEnabled"
        label="Dev Mode Enabled?"
        helperText="Sets whether dev mode is enabled (for testing purposes). If dev mode is disabled, none of the dev mode settings will be used."
      />
      {enabled && (
        <ZodTextField
          name="downloadUrlOverride"
          label="Download URL Override"
          helperText="Overrides the download URL with the specified value. Useful for testing."
          zodString={DevConfig._def.schema.shape.downloadUrlOverride}
        />
      )}
    </Fragment>
  );
};
