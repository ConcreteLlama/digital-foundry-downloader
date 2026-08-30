import { Alert, FormHelperText, Stack } from "@mui/material";
import { DfArticlesConfig } from "df-downloader-common/config/df-articles-config";
import { useFormContext, useWatch } from "react-hook-form";
import { ZodCheckboxField } from "../zod-fields/zod-checkbox-field.component";
import { ZodNumberField } from "../zod-fields/zod-number-field.component";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";

export const DfArticlesSettingsForm = () => (
  <DfSettingsSectionForm sectionName="dfArticles" title="Digital Foundry Articles">
    <DfArticlesSettings />
  </DfSettingsSectionForm>
);

const DfArticlesSettings = () => {
  const { control } = useFormContext<DfArticlesConfig>();
  const scanEnabled = useWatch({ control, name: "scanEnabled" });

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
            searching the site for every video you own. In practice that is a handful of requests a day. Going backwards
            through older content is a separate, much larger job - use Tools → Backfill, which tells you what it will
            cost first.
          </Alert>
          <ZodNumberField
            name="scanInterval"
            label="Check every (ms)"
            zodNumber={DfArticlesConfig.shape.scanInterval}
          />
          <ZodNumberField
            name="maxArticlesPerScan"
            label="Most articles to read per check"
            zodNumber={DfArticlesConfig.shape.maxArticlesPerScan}
          />
          <ZodNumberField
            name="initialLookbackDays"
            label="Days of history on a new install"
            zodNumber={DfArticlesConfig.shape.initialLookbackDays}
          />
        </>
      )}
    </Stack>
  );
};
