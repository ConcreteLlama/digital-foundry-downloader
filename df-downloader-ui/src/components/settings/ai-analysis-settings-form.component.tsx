import { Alert, Divider, FormHelperText, Stack, Typography } from "@mui/material";
import {
  AiAnalysisConfig,
  AiAnalysisEffort,
  AiAnalysisFeaturesConfig,
  AiAnalysisModel,
  AiAnalysisModelCapabilities,
  AiTagApplyMode,
  AiTaggingConfig,
  AutomaticAiAnalysisMode,
} from "df-downloader-common/config/ai-analysis-config";
import { Fragment } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { SelectField } from "../general/select-field";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { getZodDescription } from "../zod-fields/zod-schema-utils";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const AiAnalysisSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="aiAnalysis" title="AI Analysis">
      <AiAnalysisSettings />
    </DfSettingsSectionForm>
  );
};

/** Mirrors the grouping used by the subtitles form, for the same reason - general options and feature options are different questions. */
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

const ModelOptions = AiAnalysisModel.options.map((model) => ({
  id: model,
  label: AiAnalysisModelCapabilities[model].label,
}));

const EffortOptions = AiAnalysisEffort.options.map((effort) => ({
  id: effort,
  label: effort.charAt(0).toUpperCase() + effort.slice(1),
}));

const AiAnalysisSettings = () => {
  const { control } = useFormContext<AiAnalysisConfig>();
  // Watched rather than read once: switching model has to change which
  // controls are even offered, because effort is not a preference the API
  // ignores on models that lack it - it is rejected outright.
  const model = useWatch({ control, name: "model" }) ?? "claude-haiku-4-5";
  const taggingEnabled = useWatch({ control, name: "features.tagging.enabled" });
  const capabilities = AiAnalysisModelCapabilities[model as AiAnalysisModel] ?? AiAnalysisModelCapabilities["claude-haiku-4-5"];

  return (
    <Fragment>
      <SettingsGroup
        title="General"
        description="Analysis reads a video's transcript and writes a summary, a verdict and structured data for the content types that support it. Every run costs a small amount against your Anthropic account."
      >
        <ZodCheckboxField name="enabled" label="Enable AI analysis" zodBoolean={AiAnalysisConfig.shape.enabled} />
        <ZodTextField
          name="apiKey"
          label="Anthropic API Key"
          isPassword={true}
          zodString={AiAnalysisConfig.shape.apiKey}
        />
        <SelectField name="model" label="Model" opts={ModelOptions} helperText={getZodDescription(AiAnalysisConfig.shape.model)} />
        {capabilities.supportsEffort ? (
          <SelectField
            name="effort"
            label="Thinking effort"
            opts={EffortOptions}
            helperText="How long the model may think before answering. Higher is more careful and more expensive - thinking time is billed like any other output."
          />
        ) : (
          // Stated rather than silently hidden: a control that vanishes with
          // no explanation reads as a bug, and someone who set an effort
          // level on another model deserves to know why it no longer applies.
          <FormHelperText sx={{ mx: 0 }}>
            Thinking effort is not available on this model, so it is not sent. Choose Sonnet, Opus or Fable to control it.
          </FormHelperText>
        )}
        <SelectField
          name="automaticGeneration"
          label="Analyse automatically"
          helperText={getZodDescription(AutomaticAiAnalysisMode)}
          opts={[
            { id: "off", label: "Never - only when I ask" },
            { id: "during_download", label: "During download - the download isn't finished until analysis is" },
            { id: "after_download", label: "After download - the video is available straight away" },
          ]}
        />
        <ZodNumberField
          name="maxTranscriptChars"
          label="Longest transcript to analyse (characters)"
          zodNumber={AiAnalysisConfig.shape.maxTranscriptChars}
        />
      </SettingsGroup>

      <SettingsGroup title="What to produce" description="Each of these is a separate output and can be turned off on its own.">
        <ZodCheckboxField
          name="features.summary"
          label="Summary and verdict"
          zodBoolean={AiAnalysisFeaturesConfig.shape.summary}
        />
        <ZodCheckboxField
          name="features.structuredData"
          label="Structured data"
          zodBoolean={AiAnalysisFeaturesConfig.shape.structuredData}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Tags"
        description="Tagging is the one output that works without a transcript, so it applies to your whole library rather than only what you have downloaded."
      >
        <ZodCheckboxField
          name="features.tagging.enabled"
          label="Suggest tags"
          zodBoolean={AiTaggingConfig.shape.enabled}
        />
        {taggingEnabled && (
          <Fragment>
            {/* The project owner asked for this specifically, and it is a
                statement of fact about the output rather than a caveat: the
                same feature produces materially different quality depending
                on what evidence existed, and the person relying on the tags
                for filtering should know that before turning it on rather
                than inferring it from results later. */}
            <Alert severity="info" variant="outlined">
              Tag quality depends on what the analysis had to read. With a transcript, tags are specific and
              well-evidenced. Without one - which is the case for anything you have not downloaded and transcribed -
              they are inferred from the title and description alone, and are a weaker guess. Every suggestion records
              which of the two it came from, shown next to the tag.
            </Alert>
            <SelectField
              name="features.tagging.applyMode"
              label="When tags are suggested"
              helperText={getZodDescription(AiTagApplyMode)}
              opts={[
                { id: "suggest", label: "Hold them for me to accept or reject" },
                { id: "auto_apply", label: "Apply them automatically" },
              ]}
            />
            <ZodCheckboxField
              name="features.tagging.useTranscriptWhenAvailable"
              label="Use the transcript for tagging when one exists"
              zodBoolean={AiTaggingConfig.shape.useTranscriptWhenAvailable}
            />
          </Fragment>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Extra instructions"
        description="Optional. Added to the built-in prompts rather than replacing them, so the structured output keeps working."
      >
        <ZodTextField
          name="promptAdditions.summary"
          label="Extra summary instructions"
          multiline
          zodString={AiAnalysisConfig.shape.promptAdditions.unwrap().shape.summary}
        />
        <ZodTextField
          name="promptAdditions.tagging"
          label="Your tagging conventions"
          multiline
          zodString={AiAnalysisConfig.shape.promptAdditions.unwrap().shape.tagging}
        />
      </SettingsGroup>
    </Fragment>
  );
};
