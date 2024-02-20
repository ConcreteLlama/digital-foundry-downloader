import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, FormHelperText, IconButton, Stack, Typography } from "@mui/material";
import {
  DeepgramConfig,
  SubtitlesConfig,
  SubtitlesService,
  SubtitlesServicesConfig,
} from "df-downloader-common/config/subtitles-config";
import { Fragment, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { CheckboxElement } from "react-hook-form-mui";
import { OrderableListFormField } from "../general/ordered-list-form-field.component";
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
  const autoGenerateSubs = useWatch<SubtitlesConfig>({
    name: "autoGenerateSubs",
  }) as boolean;
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
      {Object.values(SubtitlesService.Values).map((serviceName) => (
        <SubtitleServiceConfig
          serviceName={serviceName}
          key={serviceName}
          onEnable={onServiceEnable}
          onDisable={onServiceDisable}
        />
      ))}
      <CheckboxElement name="autoGenerateSubs" label="Auto generate subtitles on download" />
      {autoGenerateSubs && enabledServices.length > 0 && (
        <Fragment>
          <FormHelperText>
            The order of the services in the list below determines the order in which they will be used to generate
            subtitles. If a service fails, the next one will be used. If no services are enabled, subtitles will not be
            generated.
          </FormHelperText>
          <OrderableListFormField name="servicePriorities" label="Service Priorities" />
        </Fragment>
      )}
    </Fragment>
  );
};

const SubtitlesServiceDescriptions: Record<SubtitlesService, string> = {
  youtube:
    "This will extract the captions track from the associated Youtube video (if it exists). DF videos are auto captioned by Youtube; the results may not be perfect, and" +
    " ASR tracks are not always available, but this option is at least free.",
  deepgram:
    "Deepgram is a speech-to-text service that uses AI to transcribe audio. For more information, visit https://www.deepgram.com/. This is a paid service, and requires a Deepgram API key.",
  google_stt:
    "Google's Speech-to-Text service. This is a paid service, and requires you to enable Speech-to-Text on your account (https://cloud.google.com/speech-to-text). It also requires a Google Cloud API key." +
    " You can generate one at https://console.cloud.google.com/apis/credentials an optionally restrict it to just the Speech-to-Text API.",
};

const SubtitleServiceConfigComponents: Record<SubtitlesService, React.FC> = {
  youtube: () => <Fragment />,
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
};

const SubtitleServiceDefaultValues: NonNullable<SubtitlesServicesConfig> = {
  youtube: {},
  deepgram: {
    apiKey: "",
  },
  google_stt: {
    apiKey: "",
  },
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
