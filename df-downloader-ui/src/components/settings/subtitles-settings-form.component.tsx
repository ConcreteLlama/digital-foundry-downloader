import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, Divider, FormHelperText, IconButton, Stack, Typography } from "@mui/material";
import {
  AutomaticSubtitlesMode,
  DeepgramConfig,
  GoogleSttConfig,
  SubtitlesConfig,
  SubtitlesOutputMode,
  SubtitlesService,
  SubtitlesServicesConfig,
  MaxConcurrentSubtitles,
  WhisperConfig,
} from "df-downloader-common/config/subtitles-config";
import { Fragment, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { CheckboxElement, TextFieldElement } from "react-hook-form-mui";
import { SelectField } from "../general/select-field";
import { OrderableListFormField } from "../general/ordered-list-form-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component";
import { ZodSelectField } from "../zod-fields/zod-select-field.component";
import { getZodDescription } from "../zod-fields/zod-schema-utils";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const SubtitlesSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="subtitles" title="Subtitles">
      <SubtitlesSettings />
    </DfSettingsSectionForm>
  );
};

/**
 * A titled, ruled block of related settings.
 *
 * The section previously ran general options and per-service options together
 * as one flat list, with the service blocks first - so the settings that
 * apply to everything sat underneath the settings for one particular service,
 * and nothing indicated which was which.
 */
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

const SubtitlesSettings = () => {
  const context = useFormContext<SubtitlesConfig>();
  const [enabledServices, setEnabledServices] = useState<SubtitlesService[]>(
    Object.keys(context.getValues("services") || {}) as SubtitlesService[]
  );
  const onServiceEnable = (toEnable: SubtitlesService) => {
    context.setValue(("services." + toEnable) as keyof SubtitlesConfig, SubtitleServiceDefaultValues[toEnable] as any, {
      shouldDirty: true,
    });
    setEnabledServices([...new Set([...enabledServices, toEnable])]);
  };
  const onServiceDisable = (toDisable: SubtitlesService) => {
    const currentVals = context.getValues("services");
    delete currentVals?.[toDisable];
    context.setValue("services", currentVals, {
      shouldDirty: true,
    });
    setEnabledServices(enabledServices.filter((service) => service !== toDisable));
  };

  const priorities: SubtitlesService[] = context.getValues("servicePriorities") || [];
  const prioritiesToAdd = enabledServices.filter((val) => !priorities.includes(val));
  const prioritiesToRemove = priorities.filter((val) => !enabledServices.includes(val));
  if (prioritiesToAdd.length > 0 || prioritiesToRemove.length > 0) {
    const newPriorities = [...priorities, ...prioritiesToAdd].filter((val) => !prioritiesToRemove.includes(val));
    context.setValue("servicePriorities", newPriorities, {
      shouldDirty: true,
    });
  }

  return (
    <Fragment>
      <SettingsGroup
        title="General"
        description="How and when subtitles are made, whichever service ends up producing them."
      >
        <SelectField
          name="automaticGeneration"
          label="Automatic subtitle generation"
          helperText={getZodDescription(AutomaticSubtitlesMode)}
          opts={[
            { id: "off", label: "Never - only when I ask" },
            { id: "during_download", label: "During download - the download isn't finished until subtitles are" },
            { id: "after_download", label: "After download - the video is available straight away" },
          ]}
        />
        <SelectField
          name="output"
          label="Subtitle output"
          helperText={getZodDescription(SubtitlesOutputMode)}
          opts={[
            { id: "auto", label: "Automatic - embed during download, separate file otherwise" },
            { id: "embed", label: "Always embed in the video file" },
            { id: "sidecar", label: "Always write a separate .srt file" },
          ]}
        />
        <ZodNumberField
          name="maxConcurrent"
          label="Maximum simultaneous subtitle jobs"
          zodNumber={MaxConcurrentSubtitles}
        />
        {/* Deliberately not hidden when automatic generation is off. This list
            is also what the manual "Generate Subtitles" action offers, so
            hiding it previously made manual-only impossible to set up: you
            could turn automatic off, but then never configure which service to
            use. */}
        {enabledServices.length > 0 && (
          <Fragment>
            <FormHelperText sx={{ mx: 0 }}>
              Services are tried in this order, for both automatic and manual generation. If one fails the next is
              used, and with none enabled subtitles can't be generated at all.
            </FormHelperText>
            <OrderableListFormField name="servicePriorities" label="Service Priorities" />
          </Fragment>
        )}
      </SettingsGroup>
      <SettingsGroup
        title="Services"
        description="Where transcription actually happens. Each is enabled and configured independently - the settings below belong to that service alone."
      >
        {SubtitlesService.options.map((serviceName) => (
          <SubtitleServiceConfig
            serviceName={serviceName}
            key={serviceName}
            onEnable={onServiceEnable}
            onDisable={onServiceDisable}
          />
        ))}
      </SettingsGroup>
    </Fragment>
  );
};

/** "google_stt" is an identifier, not something to show someone. */
const SubtitlesServiceLabels: Record<SubtitlesService, string> = {
  deepgram: "Deepgram",
  google_stt: "Google Speech-to-Text",
  whisper: "Whisper",
};

const SubtitlesServiceDescriptions: Record<SubtitlesService, string> = {
  deepgram:
    "Deepgram is a speech-to-text service that uses AI to transcribe audio. For more information, visit https://www.deepgram.com/. This is a paid service, and requires a Deepgram API key.",
  google_stt:
    "Google's Speech-to-Text service. This is a paid service, and requires you to enable Speech-to-Text on your account (https://cloud.google.com/speech-to-text). It also requires a Google Cloud API key." +
    " You can generate one at https://console.cloud.google.com/apis/credentials an optionally restrict it to just the Speech-to-Text API.",
  whisper:
    "Transcribes the downloaded file locally using Whisper, on this machine. No API key and no per-use cost, and because it transcribes the actual file the timings always match it exactly." +
    " The trade-off is CPU time: a 10-20 minute video takes a couple of minutes on a modest machine, but a 2-hour episode can take half an hour or more depending on the model chosen.",
};

const SubtitleServiceConfigComponents: Record<SubtitlesService, React.FC> = {
  deepgram: () => (
    <ZodTextField
      name="services.deepgram.apiKey"
      label="Deepgram API Key"
      isPassword={true}
      zodString={DeepgramConfig.shape.apiKey}
    />
  ),
  google_stt: () => (
    <ZodTextField
      name="services.google_stt.apiKey"
      label="Google API Key"
      isPassword={true}
      zodString={GoogleSttConfig.shape.apiKey}
    />
  ),
  whisper: () => <WhisperServiceConfig />,
};

/**
 * Speech-to-text reliably mangles domain jargon - "UE5" comes out as "UA5"
 * from Whisper and "U5" from YouTube's own captions - and Whisper's initial
 * prompt doesn't fix it, since it only conditions the first 30 seconds of
 * audio. A plain find/replace over the finished transcript is the thing
 * that actually works, so it's editable here.
 */
const WhisperTermCorrectionsField = () => {
  const { fields, append, remove } = useFieldArray({ name: "services.whisper.termCorrections" });
  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="subtitle2">Term Corrections</Typography>
        <IconButton size="small" onClick={() => append({ from: "", to: "", caseInsensitive: false })}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Stack>
      <FormHelperText>
        Fixes words Whisper consistently mishears. Matches whole words only. For example, replacing "UA5" with "UE5".
      </FormHelperText>
      {fields.map((field, index) => (
        <Stack direction="row" spacing={1} alignItems="center" key={field.id}>
          <TextFieldElement
            name={`services.whisper.termCorrections.${index}.from`}
            label="Heard as"
            size="small"
          />
          <TextFieldElement
            name={`services.whisper.termCorrections.${index}.to`}
            label="Replace with"
            size="small"
          />
          <CheckboxElement
            name={`services.whisper.termCorrections.${index}.caseInsensitive`}
            label="Ignore case"
          />
          <IconButton size="small" onClick={() => remove(index)}>
            <RemoveIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
    </Stack>
  );
};

const WhisperServiceConfig = () => (
  <Stack spacing={2}>
    <ZodSelectField
      name="services.whisper.model"
      label="Model"
      zodEnum={WhisperConfig.shape.model}
    />
    <ZodTextField
      name="services.whisper.language"
      label="Language"
      zodString={WhisperConfig.shape.language}
    />
    <ZodNumberField
      name="services.whisper.threads"
      label="Threads"
      zodNumber={WhisperConfig.shape.threads}
    />
    <ZodCheckboxField name="services.whisper.useGpu" label="Use GPU if available" zodBoolean={WhisperConfig.shape.useGpu} />
    <ZodTextField
      name="services.whisper.modelDir"
      label="Model Directory"
      zodString={WhisperConfig.shape.modelDir}
    />
    <ZodTextField
      name="services.whisper.binaryPath"
      label="Whisper Binary Path"
      zodString={WhisperConfig.shape.binaryPath}
    />
    <WhisperTermCorrectionsField />
  </Stack>
);

const SubtitleServiceDefaultValues: NonNullable<SubtitlesServicesConfig> = {
  deepgram: {
    apiKey: "",
  },
  google_stt: {
    apiKey: "",
  },
  whisper: WhisperConfig.parse({}),
};

const SubtitleServiceConfig = (props: {
  serviceName: SubtitlesService;
  onEnable: (toEnable: SubtitlesService) => any;
  onDisable: (toDisable: SubtitlesService) => any;
}) => {
  const { serviceName, onEnable, onDisable } = props;
  const context = useFormContext<SubtitlesConfig>();
  const services = (context.getValues("services") as SubtitlesServicesConfig) || {};
  const serviceConfig = services[serviceName];
  const ConfigComponent = SubtitleServiceConfigComponents[props.serviceName];
  return (
    // Boxed rather than run together: with three services stacked, there was
    // nothing to show where one service's settings ended and the next began.
    <Stack sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
      <Box display="flex" flexDirection="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {SubtitlesServiceLabels[props.serviceName]} ({serviceConfig ? "Enabled" : "Disabled"})
        </Typography>
        {serviceConfig ? (
          <IconButton onClick={() => onDisable(serviceName)}>
            <RemoveIcon />
          </IconButton>
        ) : (
          <IconButton onClick={() => onEnable(serviceName)}>
            <AddIcon />
          </IconButton>
        )}
      </Box>
      <FormHelperText sx={{ marginBottom: "1rem" }}>{SubtitlesServiceDescriptions[props.serviceName]}</FormHelperText>

      {serviceConfig && <ConfigComponent />}
    </Stack>
  );
};
