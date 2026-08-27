import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, FormHelperText, IconButton, Stack, Typography } from "@mui/material";
import {
  DeepgramConfig,
  SubtitlesConfig,
  SubtitlesService,
  SubtitlesServicesConfig,
  WhisperConfig,
  WhisperModel,
} from "df-downloader-common/config/subtitles-config";
import { Fragment, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { CheckboxElement, TextFieldElement } from "react-hook-form-mui";
import { SelectField } from "../general/select-field";
import { OrderableListFormField } from "../general/ordered-list-form-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { ZodSelectField } from "../zod-fields/zod-select-field.component";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const SubtitlesSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="subtitles" title="Subtitles">
      <SubtitlesSettings />
    </DfSettingsSectionForm>
  );
};

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
      {SubtitlesService.options.map((serviceName) => (
        <SubtitleServiceConfig
          serviceName={serviceName}
          key={serviceName}
          onEnable={onServiceEnable}
          onDisable={onServiceDisable}
        />
      ))}
      <SelectField
        name="automaticGeneration"
        label="Automatic subtitle generation"
        helperText="Generating subtitles locally can take a while for long videos, so you may prefer the download to finish first - or to only ever trigger it yourself, per item."
        opts={[
          { id: "off", label: "Never - only when I ask" },
          { id: "during_download", label: "During download - the download isn't finished until subtitles are" },
          { id: "after_download", label: "After download - the video is available straight away" },
        ]}
      />
      <SelectField
        name="output"
        label="Subtitle output"
        helperText="Embedding puts subtitles inside the video so they travel with it, but rewrites the whole file. A separate .srt is instant and doesn't touch a file your media server may be playing, but is left behind if you move the video without it. Note that with 'After download' selected above, Automatic always means a separate file - the video is already in your library by the time subtitles are made."
        opts={[
          { id: "auto", label: "Automatic - embed during download, separate file otherwise" },
          { id: "embed", label: "Always embed in the video file" },
          { id: "sidecar", label: "Always write a separate .srt file" },
        ]}
      />
      {/* Deliberately not hidden when automatic generation is off. This list is
          also what the manual "Generate Subtitles" action offers, so hiding it
          previously made manual-only impossible to set up: you could turn
          automatic off, but then never configure which service to use. */}
      {enabledServices.length > 0 && (
        <Fragment>
          <FormHelperText>
            The order of the services below is the order they'll be tried in, for both automatic and manual
            generation. If a service fails, the next one is used. If no services are enabled, subtitles can't be
            generated at all.
          </FormHelperText>
          <OrderableListFormField name="servicePriorities" label="Service Priorities" />
        </Fragment>
      )}
    </Fragment>
  );
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
      helperText="The Deepgram API Key"
      isPassword={true}
      zodString={DeepgramConfig.shape.apiKey}
    />
  ),
  google_stt: () => (
    <ZodTextField
      name="services.google_stt.apiKey"
      label="Google API Key"
      helperText="The Google API Key"
      isPassword={true}
      zodString={DeepgramConfig.shape.apiKey}
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
      helperText="Larger models are more accurate but considerably slower. base.en is a reasonable balance; small.en matches YouTube's own captions on proper nouns but takes around three times as long; tiny.en is fast but misses names entirely."
      zodEnum={WhisperModel}
    />
    <ZodTextField
      name="services.whisper.language"
      label="Language"
      helperText='Spoken language, or "auto" to detect it.'
      zodString={WhisperConfig.shape.language.unwrap()}
    />
    <ZodNumberField
      name="services.whisper.threads"
      label="Threads"
      helperText="How many CPU threads to transcribe with. Defaults to two fewer than this machine has cores, so transcription doesn't starve everything else running on it."
      zodNumber={WhisperConfig.shape.threads.unwrap()}
    />
    <CheckboxElement
      name="services.whisper.useGpu"
      label="Use GPU if available"
    />
    <FormHelperText>
      The Whisper build bundled in the Docker image is CPU-only, so this has no effect unless you've pointed
      "Whisper Binary Path" at your own GPU-enabled build. Worth turning off even then if the GPU is already busy
      transcoding for your media server - competing for it can be slower than staying on the CPU.
    </FormHelperText>
    <ZodTextField
      name="services.whisper.modelDir"
      label="Model Directory"
      helperText="Where model files are downloaded and cached. Defaults to a folder alongside your config. Models are downloaded on first use and range from 75MB to around 3GB."
      zodString={WhisperConfig.shape.modelDir.unwrap()}
    />
    <ZodTextField
      name="services.whisper.binaryPath"
      label="Whisper Binary Path"
      helperText="Path to the whisper.cpp 'whisper-cli' binary. Leave blank to use the one bundled in the Docker image."
      zodString={WhisperConfig.shape.binaryPath.unwrap()}
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
    <Stack>
      <Box display="flex" flexDirection="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">
          {props.serviceName} ({serviceConfig ? "Enabled" : "Disabled"})
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
