import { MaxConcurrentLocalModels } from "df-downloader-common/config/local-models-config";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

/**
 * Work that runs a model on this machine, and how much of it at once.
 *
 * One setting, and a section of its own rather than a field under Subtitles,
 * because the limit was never really about subtitles: transcription and local
 * analysis contend for the same cores, so a subtitles-only number could not
 * describe what actually happens.
 */
export const LocalModelsSettingsForm = () => (
  <DfSettingsSectionForm sectionName="localModels" title="Local models">
    <ZodNumberField
      name="maxConcurrent"
      label="Maximum simultaneous local model jobs"
      zodNumber={MaxConcurrentLocalModels}
    />
  </DfSettingsSectionForm>
);
