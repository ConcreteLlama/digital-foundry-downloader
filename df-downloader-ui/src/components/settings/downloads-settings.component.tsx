import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { DownloadsConfig } from "df-downloader-common/config/download-config";

export const DownloadsSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="downloads" title="Digital Foundry Credentials">
      <ZodNumberField
        name="maxSimultaneousDownloads"
        label="Max Simultaneous Downloads"
        helperText="Maximum number of downloads to run at once"
        zodNumber={DownloadsConfig.shape.maxSimultaneousDownloads._def.innerType}
      />
      <ZodNumberField
        name="maxConnectionsPerDownload"
        label="Max Connections Per Download"
        helperText="Maximum number of connections to use per download"
        zodNumber={DownloadsConfig.shape.maxConnectionsPerDownload._def.innerType}
      />
      <ZodNumberField
        name="failureRetryIntervalBase"
        label="Failure Retry Interval Base"
        helperText="Base interval to use when retrying a failed download (in milliseconds)"
        zodNumber={DownloadsConfig.shape.failureRetryIntervalBase._def.innerType}
      />
      <ZodNumberField
        name="maxRetries"
        label="Max Retries"
        helperText="Maximum number of times to retry a failed download"
        zodNumber={DownloadsConfig.shape.maxRetries._def.innerType}
      />
    </DfSettingsSectionForm>
  );
};
