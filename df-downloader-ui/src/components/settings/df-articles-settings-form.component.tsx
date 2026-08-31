import { Alert, FormHelperText, Stack } from "@mui/material";
import { DfArticlesConfig } from "df-downloader-common/config/df-articles-config";
import { useFormContext, useWatch } from "react-hook-form";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { ZodDurationField } from "../zod-fields/zod-duration-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const DfArticlesSettingsForm = () => (
  <DfSettingsSectionForm sectionName="dfArticles" title="Digital Foundry Articles">
    <DfArticlesSettings />
  </DfSettingsSectionForm>
);

const DfArticlesSettings = () => {
  const { control } = useFormContext<DfArticlesConfig>();
  const scanEnabled = useWatch({ control, name: "scanEnabled" });
  const archiveWalkEnabled = useWatch({ control, name: "archiveWalkEnabled" });

  return (
    <Stack spacing={2}>
      <FormHelperText sx={{ mx: 0 }}>
        Digital Foundry often publish a written piece alongside a video. Where one exists, it is a better source than
        the video's audio - it was written rather than transcribed, so product names and figures are correct, and for PC
        reviews it frequently contains the settings table outright. Matching one to a video attaches it for reading, and
        gives any later analysis something firmer to work from.
      </FormHelperText>

      <ZodCheckboxField
        name="scanEnabled"
        label="Check for newly published articles"
        zodBoolean={DfArticlesConfig.shape.scanEnabled}
      />

      {scanEnabled && (
        <>
          {/* Worth stating plainly. Every other path to an article searches
              the site per video, which is slow enough that the backfill tool
              quotes a duration before starting - so "runs on a timer" could
              reasonably be read as alarming here. It is the opposite job,
              and cheap for a structural reason rather than by tuning. */}
          <Alert severity="info" variant="outlined">
            This reads each newly published article once and attaches it to whatever video it embeds, rather than
            searching the site for every video you own. In practice that is a handful of requests a day. Older articles
            are handled separately below, and Tools → Backfill is still there for matching a specific set of videos on
            demand.
          </Alert>
          <ZodDurationField
            name="scanInterval"
            label="Check every (ms)"
            zodNumber={DfArticlesConfig.shape.scanInterval}
          />
          <ZodNumberField
            name="maxArticlesPerScan"
            label="Most articles to read per check"
            zodNumber={DfArticlesConfig.shape.maxArticlesPerScan}
          />
          <ZodCheckboxField
            name="archiveWalkEnabled"
            label="Also work backwards through older articles"
            zodBoolean={DfArticlesConfig.shape.archiveWalkEnabled}
          />
          {/* Only worth setting when nothing is working backwards. With the
              walk on, it reaches the same recent articles anyway and then
              keeps going, so a first-run window is a second answer to a
              question already answered - and two settings that look like they
              both decide how much history you get is the confusing part. */}
          {!archiveWalkEnabled && (
            <ZodNumberField
              name="initialLookbackDays"
              label="Days of history on a new install"
              zodNumber={DfArticlesConfig.shape.initialLookbackDays}
            />
          )}
          {archiveWalkEnabled && (
            /* The honest shape of it. "Reads the whole archive" invites the
               assumption of a long crawl on first boot, which is the thing
               this was built not to do. */
            <Alert severity="info" variant="outlined">
              Reads one index and up to the limit below per pass, picking up where it left off, so the archive is
              covered over a couple of days of ordinary running rather than in one go. Requests are spaced out and
              anything you do yourself takes priority, and it stops by itself once it has been through everything.
            </Alert>
          )}
          {archiveWalkEnabled && (
            <>
              <ZodNumberField
                name="archiveWalkPerRun"
                label="Older articles to read per pass"
                zodNumber={DfArticlesConfig.shape.archiveWalkPerRun}
              />
              <ZodDurationField
                name="archiveWalkInterval"
                label="Pass through older articles every (ms)"
                zodNumber={DfArticlesConfig.shape.archiveWalkInterval}
              />
            </>
          )}
        </>
      )}
    </Stack>
  );
};
