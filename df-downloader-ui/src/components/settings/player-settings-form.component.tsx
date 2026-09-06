import { Alert, Stack } from "@mui/material";
import { PlayerConfig } from "df-downloader-common/config/player-config";
import { SelectField } from "../general/select-field";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { getZodDescription } from "../zod-fields/zod-schema-utils";
import { DfSettingsSectionForm } from "./df-settings-section-form.component.tsx";

export const PlayerSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="player" title="Player">
      <PlayerSettings />
    </DfSettingsSectionForm>
  );
};

const PlayerSettings = () => (
  <Stack spacing={3}>
    {/*
      Stated rather than left to be discovered. Someone arriving at this page
      has probably just watched a video with no sound and no explanation, and
      the useful thing is to say what happened and that the file is fine.
    */}
    <Alert severity="info" variant="outlined">
      Some Digital Foundry downloads use AC-3 audio, which browsers cannot decode - so those play here with picture and
      no sound, even though the file itself is perfectly good and plays with sound in Plex, Jellyfin or VLC. The
      settings below let the app re-encode just the parts your browser cannot take, as it plays. Files it can already
      play are sent straight from disk and are not affected.
    </Alert>
    <SelectField
      name="transcode"
      label="When a file will not play"
      helperText={getZodDescription(PlayerConfig.shape.transcode)}
      opts={[
        { id: "unsupported_only", label: "Re-encode it so it plays here" },
        { id: "never", label: "Leave it alone - I will watch it elsewhere" },
        { id: "always", label: "Always re-encode, including the video (testing)" },
      ]}
    />
    <SelectField
      name="fullscreenRotate"
      label="Turn the screen in fullscreen"
      helperText={getZodDescription(PlayerConfig.shape.fullscreenRotate)}
      opts={[
        { id: "auto", label: "Only where it gains picture" },
        { id: "always", label: "Always turn to landscape" },
        { id: "never", label: "Never turn the screen" },
      ]}
    />
    <SelectField
      name="hardwareAcceleration"
      label="Use the graphics card to re-encode video"
      helperText={getZodDescription(PlayerConfig.shape.hardwareAcceleration)}
      opts={[
        { id: "auto", label: "Use it if it is there" },
        { id: "off", label: "Always use the processor" },
      ]}
    />
    <ZodNumberField
      name="maxConcurrentStreams"
      label="Videos re-encoded at once"
      zodNumber={PlayerConfig.shape.maxConcurrentStreams}
    />
    {/*
      The honest caveat, and the one most likely to be mistaken for a bug: a
      re-encoded stream is produced as it is sent, so the bytes for a later
      moment do not exist yet and the browser cannot seek within it. Skipping
      works, but it starts the encode again from there.
    */}
    <Alert severity="warning" variant="outlined">
      A re-encoded video is made as you watch it, so skipping ahead has to start it again from the new position. Expect
      a short pause when you jump, and a little rewind to the nearest keyframe. Files your browser can already play are
      served straight from disk and seek normally.
    </Alert>
  </Stack>
);
