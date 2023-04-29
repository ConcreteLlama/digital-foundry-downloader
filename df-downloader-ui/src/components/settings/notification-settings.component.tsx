import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { Fragment, useState } from "react";
import { Box, Button, IconButton, Typography, Select, MenuItem, InputLabel } from "@mui/material";
import { CheckboxElement, MultiSelectElement, useFormContext, useWatch } from "react-hook-form-mui";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import {
  AllNotificationServiceKeys,
  NotificationsConfig,
  PushbulletNotificationsConfig,
  PushbulletServiceKey,
} from "df-downloader-common/config/notifications-config";
import { DfNotificationType } from "df-downloader-common";
import DeleteIcon from "@mui/icons-material/Delete";

export const NotificationSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="notifications" title="Notifications">
      <NotificationSettings />
    </DfSettingsSectionForm>
  );
};

const NotificationSettings = () => {
  const formContext = useFormContext<NotificationsConfig>();
  const initialValues = formContext.getValues();
  const [services, setServices] = useState<string[]>(Object.keys(initialValues?.services || {}));
  const removeService = (service: string) => {
    setServices(services.filter((s) => s !== service));
  };
  const addableServices = AllNotificationServiceKeys.filter((service) => !services.includes(service));
  //TODO: Fix error with empty service list
  //TODO: Properly type the keys and remove the as any on formContext.setValue
  return (
    <Fragment>
      <InputLabel>Select a Notifications Service</InputLabel>
      <Select>
        {addableServices.map((service) => (
          <MenuItem
            key={service}
            onClick={() => {
              formContext.setValue(`services.${service}.enabled` as any, true, {
                shouldDirty: true,
              });
              setServices([...services, service]);
            }}
          >
            {service}
          </MenuItem>
        ))}
      </Select>
      {services.includes(PushbulletServiceKey) && (
        <PushbulletSettings remove={() => removeService(PushbulletServiceKey)} />
      )}
    </Fragment>
  );
};

const PUSHBULLET_KEY = `services.${PushbulletServiceKey}`;

// TODO: Generify this
type PushbulletSettingsProps = {
  remove: () => void;
};
const PushbulletSettings = ({ remove }: PushbulletSettingsProps) => {
  const formContext = useFormContext();
  return (
    <Fragment>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h6">Pushbullet</Typography>
        <IconButton
          onClick={() => {
            formContext.setValue(PUSHBULLET_KEY, undefined, {
              shouldDirty: true,
            });
            remove();
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
      <CheckboxElement name={`${PUSHBULLET_KEY}.enabled`} label="Enabled" />
      <PushbulletApiKeyField />
      <MultiSelectElement
        name={`${PUSHBULLET_KEY}.subscribedNotifications`}
        label="Subscribed Notifications"
        options={Object.values(DfNotificationType)}
        showChips
        required
      />
    </Fragment>
  );
};

const PushbulletApiKeyField = () => {
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const apiKeyValue = useWatch({
    name: `${PUSHBULLET_KEY}.apiKey`,
  });
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <ZodTextField
        sx={{ width: 400 }}
        name={`${PUSHBULLET_KEY}.apiKey`}
        label="API Key"
        onChange={() => setTestResult(null)}
        zodString={PushbulletNotificationsConfig.shape.apiKey}
      />
      <Button
        sx={{ bgcolor: testResult === false ? "error.main" : "default", width: 200 }}
        disabled={!apiKeyValue || testResult === true}
        variant="contained"
        onClick={() => testPushbullet(apiKeyValue, setTestResult)}
      >
        {testResult === null ? "Test API Key" : testResult ? "API Key Test Success" : "API Key Test Failed"}
      </Button>
    </Box>
  );
};

const testPushbullet = (apiKey: string, setResult: (result: boolean) => void) => {
  fetch("https://api.pushbullet.com/v2/pushes", {
    method: "POST",
    headers: {
      "Access-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Test",
      body: "This is a test notification from DF Downloader",
      type: "note",
    }),
  })
    .then((res) => {
      if (res.ok) {
        setResult(true);
      } else {
        setResult(false);
      }
    })
    .catch(() => {
      setResult(false);
    });
};
