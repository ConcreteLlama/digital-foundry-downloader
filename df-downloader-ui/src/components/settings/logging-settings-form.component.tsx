import { Divider, FormHelperText, Stack, Typography } from "@mui/material";
import { FileLoggingConfig, LoggingConfig } from "df-downloader-common/config/logging-config";
import { Fragment } from "react";
import { useWatch } from "react-hook-form-mui";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { ZodSelectField } from "../zod-fields/zod-select-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const LoggingSettingsForm = () => (
  <DfSettingsSectionForm sectionName="logging" title="Logging">
    <LoggingSettings />
  </DfSettingsSectionForm>
);

/** Matches the grouping used by the other multi-part settings sections. */
const SettingsGroup = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <Stack sx={{ mb: 4 }}>
    <Typography variant="h6">{title}</Typography>
    {description && <FormHelperText sx={{ mx: 0, mb: 1 }}>{description}</FormHelperText>}
    <Divider sx={{ mb: 2 }} />
    <Stack spacing={2}>{children}</Stack>
  </Stack>
);

const LoggingSettings = () => {
  const fileLoggingEnabled = useWatch({ name: "file.enabled" });
  return (
    <Fragment>
      <SettingsGroup
        title="Console"
        description="What the service prints as it runs. If you are not watching a terminal or container log, this is the setting that matters least - the log file below is what the Logs page reads."
      >
        <ZodSelectField name="logLevel" label="Console log level" zodEnum={LoggingConfig.shape.logLevel} />
      </SettingsGroup>
      <SettingsGroup
        title="Log file"
        description="Kept in the work directory, and read by the Logs page under System."
      >
        <ZodCheckboxField
          name="file.enabled"
          label="Write a log file"
          zodBoolean={FileLoggingConfig.shape.enabled}
        />
        {fileLoggingEnabled && (
          <Fragment>
            <ZodSelectField
              name="file.logLevel"
              label="File log level"
              zodEnum={FileLoggingConfig.shape.logLevel}
            />
            <ZodNumberField
              name="file.maxFileSizeMb"
              label="Maximum file size (MB)"
              zodNumber={FileLoggingConfig.shape.maxFileSizeMb}
            />
            <ZodNumberField
              name="file.maxFiles"
              label="Number of files to keep"
              zodNumber={FileLoggingConfig.shape.maxFiles}
            />
          </Fragment>
        )}
      </SettingsGroup>
    </Fragment>
  );
};
