import { Alert, Box, Button, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
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
  JellyfinListUsersRequest,
  JellyfinListUsersResponse,
  JellyfinUser,
  MediaServerLibrary,
  TestMediaServerRequest,
  TestMediaServerResponse,
  WatchStateSyncResult,
  parseResponseBody,
} from "df-downloader-common";
import { useEffect, useState } from "react";
import { AutocompleteElement, useFormContext, useWatch } from "react-hook-form-mui";
import { ContentManagementConfig } from "df-downloader-common/config/content-management-config";
import { API_URL } from "../../config";
import { fetchJson } from "../../utils/fetch";
import { syncWatchStateNow } from "../../api/watch-state";
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
      Connect Plex or Jellyfin, then choose what the connection does. It can tell the server to rescan when files
      change - so a download appears in your library straight away rather than waiting for its next scheduled scan -
      and it can keep watched state in step, both ways. The two are independent: a machine that never serves media
      can still be worth reading watched state from.
    </Typography>
    <ZodNumberField
      name="settleSeconds"
      label="Settle time (seconds)"
      zodNumber={MediaServersConfig.shape.settleSeconds}
    />
    <ZodNumberField
      name="playStateSyncMinutes"
      label="Pull watched state every (minutes)"
      zodNumber={MediaServersConfig.shape.playStateSyncMinutes}
    />
    <SyncNowButton />
    <Divider />
    <ServerSection
      type={PlexServerKey}
      title="Plex"
      credentialName="token"
      credentialLabel="Plex token"
      credentialSchema={PlexMediaServerConfig.shape.token}
      urlSchema={PlexMediaServerConfig.shape.url}
      enabledSchema={PlexMediaServerConfig.shape.enabled}
      notifyOnChangeSchema={PlexMediaServerConfig.shape.notifyOnChange}
      playStateSchema={PlexMediaServerConfig.shape.syncPlayState}
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
      notifyOnChangeSchema={JellyfinMediaServerConfig.shape.notifyOnChange}
      playStateSchema={JellyfinMediaServerConfig.shape.syncPlayState}
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
  notifyOnChangeSchema: any;
  playStateSchema: any;
  urlHint: string;
};

type SyncState =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "done"; result: WatchStateSyncResult }
  | { status: "error"; message: string };

/**
 * Pull from the servers without waiting for the timer.
 *
 * Worth a button because the timer is measured in half-hours: having just
 * entered credentials, the question "did that work" is immediate and the
 * answer would otherwise be half an hour away.
 *
 * Reports what each server recognised rather than a bare "done". A server
 * that answers happily and matches none of your files is the signature of a
 * wrong path mapping, and without the numbers that is indistinguishable from
 * having nothing to do.
 */
const SyncNowButton = () => {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  return (
    <Box>
      <Button
        variant="outlined"
        disabled={state.status === "syncing"}
        onClick={async () => {
          setState({ status: "syncing" });
          try {
            setState({ status: "done", result: await syncWatchStateNow() });
          } catch (e) {
            setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
          }
        }}
      >
        {state.status === "syncing" ? "Syncing..." : "Sync watched state now"}
      </Button>
      {state.status === "error" && (
        <Alert severity="error" sx={{ marginTop: 1 }}>
          {state.message}
        </Alert>
      )}
      {state.status === "done" && (
        <Stack spacing={1} sx={{ marginTop: 1 }}>
          {!state.result.ran || !state.result.servers.length ? (
            <Alert severity="info">
              Nothing to sync - no server has "Keep watched state in step" switched on.
            </Alert>
          ) : (
            <>
              {state.result.servers.map((server) => (
                <Alert key={server.source} severity={server.matched ? "success" : "warning"}>
                  {server.matched
                    ? `${server.source} recognised ${server.matched} of your ${server.asked} downloaded files.`
                    : `${server.source} recognised none of your ${server.asked} downloaded files. If it does have them, the path mapping above is probably wrong.`}
                </Alert>
              ))}
              <Alert severity={state.result.changed ? "success" : "info"}>
                {state.result.changed
                  ? `Updated watched state for ${state.result.changed} item${state.result.changed === 1 ? "" : "s"}.`
                  : "Nothing had changed since the last sync."}
              </Alert>
            </>
          )}
        </Stack>
      )}
    </Box>
  );
};

const ServerSection = ({
  type,
  title,
  credentialName,
  credentialLabel,
  credentialSchema,
  urlSchema,
  enabledSchema,
  notifyOnChangeSchema,
  playStateSchema,
  urlHint,
}: ServerSectionProps) => {
  const base = `servers.${type}`;
  const formContext = useFormContext();
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const enabled = useWatch({ name: `${base}.enabled` });

  return (
    <Stack spacing={2}>
      <Typography variant="h6">{title}</Typography>
      <ZodCheckboxField name={`${base}.enabled`} label={`Connect to ${title}`} zodBoolean={enabledSchema} />
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
          {/*
            Part of setting the connection up, not of either job: both the
            rescan and the watched-state sync match on paths, so a wrong
            mapping breaks them equally. It sits directly under the test
            because the test is what lists the folders the server really has.
          */}
          <PathMapping
            base={base}
            title={title}
            libraries={test.status === "success" ? test.libraries : []}
          />
          {/*
            The two jobs a connection can do, kept apart because people want
            them separately: a machine that never serves media has no use for
            rescans but every use for watched state, and before this the only
            way to get the second was to accept the first.
          */}
          <ZodCheckboxField
            name={`${base}.notifyOnChange`}
            label={`Tell ${title} to rescan when files change`}
            zodBoolean={notifyOnChangeSchema}
          />
          <ZodCheckboxField
            name={`${base}.syncPlayState`}
            label={`Keep watched state in step with ${title}`}
            zodBoolean={playStateSchema}
          />
          {type === JellyfinServerKey ? <JellyfinPlayStateUser base={base} /> : null}
        </>
      ) : null}
    </Stack>
  );
};

type UsersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; users: JellyfinUser[] }
  | { status: "error"; message: string };

/**
 * Which Jellyfin account watched state belongs to.
 *
 * A picker rather than a sign-in. Jellyfin's play-state endpoints are
 * user-scoped, so this app has to know whose state it is keeping - but an API
 * key is a server-level credential that can already act for any user, so a
 * user id was the only thing ever actually needed. Verified against a real
 * server: the key alone lists users, reads their items and writes played
 * status.
 *
 * The old flow asked for a username and password purely to obtain that id,
 * which meant handling a password to learn something the key could already
 * tell us. Existing installs keep working untouched - a stored user token is
 * still used when present, and the API key is the fallback.
 */
const JellyfinPlayStateUser = ({ base }: { base: string }) => {
  const { setValue } = useFormContext();
  const syncPlayState = useWatch({ name: `${base}.syncPlayState` });
  const url = useWatch({ name: `${base}.url` });
  const apiKey = useWatch({ name: `${base}.apiKey` });
  const userId = useWatch({ name: `${base}.userId` });
  const [state, setState] = useState<UsersState>({ status: "idle" });

  const load = async () => {
    if (!url || !apiKey) {
      setState({ status: "error", message: "Enter the server URL and API key first." });
      return;
    }
    setState({ status: "loading" });
    try {
      const body: JellyfinListUsersRequest = { url, apiKey };
      const data = await fetchJson(`${API_URL}/media-servers/jellyfin-users`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const result = parseResponseBody(data, JellyfinListUsersResponse);
      if (result.data?.ok && result.data.users?.length) {
        setState({ status: "loaded", users: result.data.users });
      } else {
        setState({ status: "error", message: result.data?.error || "Could not list Jellyfin users." });
      }
    } catch (e: any) {
      setState({ status: "error", message: e?.message || "Could not list Jellyfin users." });
    }
  };

  // Only once the job is actually switched on, and only when there is a
  // credential to ask with - otherwise this fires a doomed request every time
  // the settings page is opened.
  useEffect(() => {
    if (syncPlayState && url && apiKey && state.status === "idle") {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPlayState, url, apiKey]);

  if (!syncPlayState) {
    return null;
  }

  const users = state.status === "loaded" ? state.users : [];
  // Keeps a saved id selectable before the list arrives, so the field does not
  // read as empty for an install that is already configured.
  const options = userId && !users.some((u) => u.id === userId) ? [{ id: userId, name: userId }, ...users] : users;

  return (
    <Stack spacing={1} sx={{ pl: 2, borderLeft: 2, borderColor: "divider" }}>
      <Typography variant="body2" color="text.secondary">
        Jellyfin records what was watched against a person, so pick whose watched state this should keep in step. The
        API key above is all that is needed - no password.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
        <TextField
          select
          label="Jellyfin user"
          size="small"
          sx={{ flex: 1, maxWidth: 320 }}
          value={options.length ? userId ?? "" : ""}
          onChange={(e) => setValue(`${base}.userId`, e.target.value, { shouldDirty: true })}
          disabled={state.status === "loading" || !options.length}
          helperText={state.status === "loading" ? "Loading users..." : undefined}
        >
          {options.map((user) => (
            <MenuItem key={user.id} value={user.id}>
              {user.name}
            </MenuItem>
          ))}
        </TextField>
        <Button onClick={load} disabled={state.status === "loading"} sx={{ marginTop: 0.5 }}>
          {state.status === "loading" ? "Loading..." : "Reload"}
        </Button>
      </Box>
      {state.status === "error" && <Alert severity="error">{state.message}</Alert>}
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
