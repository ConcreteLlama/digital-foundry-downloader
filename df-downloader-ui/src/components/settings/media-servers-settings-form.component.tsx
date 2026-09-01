import { Alert, Box, Button, Divider, Stack, Typography } from "@mui/material";
import {
  JellyfinMediaServerConfig,
  JellyfinServerKey,
  MediaServerType,
  MediaServersConfig,
  PlexMediaServerConfig,
  PlexServerKey,
  applyPathMapping,
} from "df-downloader-common/config/media-servers-config";
import {
  MediaServerLibrary,
  TestMediaServerRequest,
  TestMediaServerResponse,
  parseResponseBody,
} from "df-downloader-common";
import { useEffect, useState } from "react";
import { AutocompleteElement, useFormContext, useWatch } from "react-hook-form-mui";
import { ContentManagementConfig } from "df-downloader-common/config/content-management-config";
import { API_URL } from "../../config";
import { fetchJson } from "../../utils/fetch";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { ZodTextField } from "../zod-fields/zod-text-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const MediaServersSettingsForm = () => (
  <DfSettingsSectionForm sectionName="mediaServers" title="Media Servers">
    <MediaServerSettings />
  </DfSettingsSectionForm>
);

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success"; message: string; libraries: MediaServerLibrary[] }
  | { status: "error"; message: string };

const MediaServerSettings = () => (
  <Stack spacing={3}>
    <Typography variant="body2" color="text.secondary">
      Tell Plex or Jellyfin when files change, so a download appears in your library straight away rather than
      waiting for the server's next scheduled scan. Metadata written into a file, new subtitles and files moved by
      the Reorganize tool all count as changes.
    </Typography>
    <ZodNumberField
      name="settleSeconds"
      label="Settle time (seconds)"
      zodNumber={MediaServersConfig.shape.settleSeconds}
    />
    <Divider />
    <ServerSection
      type={PlexServerKey}
      title="Plex"
      credentialName="token"
      credentialLabel="Plex token"
      credentialSchema={PlexMediaServerConfig.shape.token}
      urlSchema={PlexMediaServerConfig.shape.url}
      enabledSchema={PlexMediaServerConfig.shape.enabled}
      urlHint="e.g. http://192.168.1.10:32400"
    />
    <Divider />
    <ServerSection
      type={JellyfinServerKey}
      title="Jellyfin"
      credentialName="apiKey"
      credentialLabel="API key"
      credentialSchema={JellyfinMediaServerConfig.shape.apiKey}
      urlSchema={JellyfinMediaServerConfig.shape.url}
      enabledSchema={JellyfinMediaServerConfig.shape.enabled}
      urlHint="e.g. http://192.168.1.10:8096"
    />
  </Stack>
);

type ServerSectionProps = {
  type: MediaServerType;
  title: string;
  credentialName: string;
  credentialLabel: string;
  credentialSchema: any;
  urlSchema: any;
  enabledSchema: any;
  urlHint: string;
};

const ServerSection = ({
  type,
  title,
  credentialName,
  credentialLabel,
  credentialSchema,
  urlSchema,
  enabledSchema,
  urlHint,
}: ServerSectionProps) => {
  const base = `servers.${type}`;
  const formContext = useFormContext();
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const enabled = useWatch({ name: `${base}.enabled` });

  return (
    <Stack spacing={2}>
      <Typography variant="h6">{title}</Typography>
      <ZodCheckboxField name={`${base}.enabled`} label={`Tell ${title} when files change`} zodBoolean={enabledSchema} />
      {enabled ? (
        <>
          <ZodTextField
            name={`${base}.url`}
            label="Server URL"
            helperText={urlHint}
            zodString={urlSchema}
            sx={{ maxWidth: 480 }}
            onChange={() => setTest({ status: "idle" })}
          />
          <ZodTextField
            name={`${base}.${credentialName}`}
            label={credentialLabel}
            isPassword
            zodString={credentialSchema}
            sx={{ maxWidth: 480 }}
            onChange={() => setTest({ status: "idle" })}
          />
          <Box>
            <Button
              variant="contained"
              disabled={test.status === "testing"}
              onClick={() => {
                const values = formContext.getValues()?.servers?.[type] ?? {};
                // Connection fields only - a path mapping cannot exist yet, since
                // its options come from this very test.
                testServer(
                  type,
                  type === PlexServerKey
                    ? { url: values.url, token: values.token }
                    : { url: values.url, apiKey: values.apiKey },
                  setTest
                );
              }}
            >
              {test.status === "testing" ? "Testing..." : `Test ${title} connection`}
            </Button>
          </Box>
          {/*
            The whole message, not a red button. A wrong token and an
            unreachable host need different fixes, and for Plex the success
            text lists the libraries it can see - which is what tells you
            whether your path mapping points at somewhere real.
          */}
          {test.status === "success" && <Alert severity="success">{test.message}</Alert>}
          {test.status === "error" && <Alert severity="error">{test.message}</Alert>}
          <PathMapping
            base={base}
            title={title}
            libraries={test.status === "success" ? test.libraries : []}
          />
        </>
      ) : null}
    </Stack>
  );
};

const PathMapping = ({
  base,
  title,
  libraries,
}: {
  base: string;
  title: string;
  libraries: MediaServerLibrary[];
}) => {
  const mapping = useWatch({ name: `${base}.pathMapping` });
  /*
   * Fetched straight from the API into local state, deliberately not through
   * the config store.
   *
   * This form is scoped to the mediaServers section, so the value is not in
   * the form context. Dispatching queryConfigSection for another section does
   * fetch it, but selectConfigLoading is global: the whole settings form
   * unmounts to a spinner and FormContainer remounts from saved defaults,
   * silently discarding whatever the user had just typed or ticked. That is
   * a real bug this caused - a checkbox that flashed on and reverted.
   */
  const [destinationDir, setDestinationDir] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    fetchJson(`${API_URL}/config/contentManagement`)
      .then((data) => {
        const parsed = parseResponseBody(data, ContentManagementConfig);
        if (!cancelled) {
          setDestinationDir(parsed.data?.destinationDir);
        }
      })
      .catch(() => {
        // Only powers a suggestion and a preview line; the field still accepts
        // free text without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const serverPaths = libraries.flatMap((library) => library.locations);

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Path mapping</Typography>
      <Typography variant="body2" color="text.secondary">
        Where this app writes files, and what {title} calls the same folder. Usually needed when either side runs in
        a container - {title} is told to scan a path, and a path it has never heard of fails quietly. Leave both
        blank if you both see identical paths.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
        {/*
          Both sides are chosen rather than typed, because both are already
          known: this app's own download folder, and the folders the server
          reported when its connection was tested. Free text stays allowed for
          the case where the right mapping is a parent of either.
        */}
        <AutocompleteElement
          name={`${base}.pathMapping.from`}
          label="This app sees"
          options={destinationDir ? [destinationDir] : []}
          autocompleteProps={{ freeSolo: true, sx: { flex: 1 } }}
          textFieldProps={{ helperText: destinationDir ? "Your download folder" : " " }}
        />
        <AutocompleteElement
          name={`${base}.pathMapping.to`}
          label={`${title} sees`}
          options={serverPaths}
          autocompleteProps={{ freeSolo: true, sx: { flex: 1 } }}
          textFieldProps={{
            helperText: serverPaths.length
              ? `${title}'s own library folders`
              : `Test the connection to load ${title}'s folders`,
          }}
        />
      </Box>
      {/*
        Shows the rule actually being applied to the directory downloads land
        in. Mapping mistakes are otherwise invisible until a refresh silently
        does nothing, which is the failure this whole feature is prone to.
      */}
      {destinationDir ? (
        <Typography variant="caption" color="text.secondary">
          Your download folder <code>{destinationDir}</code> will be sent to {title} as{" "}
          <code>{applyPathMapping(destinationDir, mapping)}</code>
        </Typography>
      ) : null}
    </Stack>
  );
};

const testServer = async (type: MediaServerType, config: any, setState: (state: TestState) => void) => {
  setState({ status: "testing" });
  try {
    // Only this server's values - see TestMediaServerRequest.
    const requestBody = { type, config } as TestMediaServerRequest;
    const data = await fetchJson(`${API_URL}/media-servers/test`, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: { "Content-Type": "application/json" },
    });
    const result = parseResponseBody(data, TestMediaServerResponse);
    if (result.data?.ok) {
      setState({
        status: "success",
        message: result.data.detail || "Connected.",
        libraries: result.data.libraries ?? [],
      });
    } else {
      setState({
        status: "error",
        message: result.data?.error || result.error?.message || "Could not reach the server.",
      });
    }
  } catch (e: any) {
    setState({ status: "error", message: e?.message || "Could not reach the server." });
  }
};
