import { Divider } from "@mui/material";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { DownloadsConfig } from "df-downloader-common/config/download-config";

export const DownloadsSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="downloads" title="Digital Foundry Credentials">
      <ZodNumberField
        name="maxSimultaneousDownloads"
        label="Max Simultaneous Downloads"
        zodNumber={DownloadsConfig.shape.maxSimultaneousDownloads}
      />

      <ZodNumberField
        name="maxConnectionsPerDownload"
        label="Max Connections Per Download"
        zodNumber={DownloadsConfig.shape.maxConnectionsPerDownload}
      />
      <ZodNumberField
        name="failureRetryIntervalBase"
        label="Failure Retry Interval Base"
        zodNumber={DownloadsConfig.shape.failureRetryIntervalBase}
        step={1000}
      />
      <ZodNumberField
        name="maxRetries"
        label="Max Retries"
        zodNumber={DownloadsConfig.shape.maxRetries}
      />
      <ZodNumberField
        name="maxRetryDelay"
        label="Max Retry Delay"
        zodNumber={DownloadsConfig.shape.maxRetryDelay}
        step={1000}
      />
      <Divider>Connection options</Divider>
      <ZodNumberField
        name="connectionMaxRetries"
        label="Connection Max Retries"
        zodNumber={DownloadsConfig.shape.connectionMaxRetries}
      />
      <ZodNumberField
        name="connectionRetryDelayBase"
        label="Connection Retry Delay Base"
        zodNumber={DownloadsConfig.shape.connectionRetryDelayBase}
        step={1000}
      />
      <ZodNumberField
        name="connectionRetryDelayMultiplier"
        label="Connection Retry Delay Multiplier"
        zodNumber={DownloadsConfig.shape.connectionRetryDelayMultiplier}
      />
      <ZodNumberField
        name="connectionMaxRetryDelay"
        label="Connection Max Retry Delay"
        zodNumber={DownloadsConfig.shape.connectionMaxRetryDelay}
        step={1000}
      />
    </DfSettingsSectionForm>
  );
};
