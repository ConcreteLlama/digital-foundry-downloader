import { Box, Stack, Typography } from "@mui/material";
import { UiConfig, UiThemeName } from "df-downloader-common/config/ui-config";
import { SelectField } from "../general/select-field";
import { getZodDescription } from "../zod-fields/zod-schema-utils";
import { palettes, uiThemeNames } from "../../themes/palettes";
import { useThemeChoice } from "../../themes/theme-provider";
import { DfSettingsSectionForm } from "./df-settings-section-form.component.tsx";

export const AppearanceSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="ui" title="Appearance">
      <AppearanceSettings />
    </DfSettingsSectionForm>
  );
};

const AppearanceSettings = () => {
  const { setThemeName } = useThemeChoice();
  return (
    <Stack spacing={3}>
      <Box>
        <SelectField
          name="theme"
          label="Theme"
          opts={uiThemeNames.map((name) => ({ id: name, label: palettes[name].label }))}
          helperText={getZodDescription(UiConfig.shape.theme)}
          // Applied on selection rather than on save - a theme you can't see
          // until you commit to it is not a choice you can make.
          onChange={(value) => value && setThemeName(value as UiThemeName)}
        />
      </Box>
      <ThemePreview />
      <Typography variant="body2" color="text.secondary">
        The theme is remembered in this browser immediately. Saving also stores it against the
        installation, so a browser that has never picked one of its own will follow it.
      </Typography>
    </Stack>
  );
};

/**
 * The states that actually have to stay apart from one another. Worth showing
 * side by side, because a palette can look fine in isolation and still make an
 * active download and a failed step read as the same colour.
 */
const ThemePreview = () => {
  const { themeName } = useThemeChoice();
  const palette = palettes[themeName];
  const swatches: { label: string; colour: string }[] = [
    { label: "Active", colour: palette.accent },
    { label: "Done", colour: palette.ok },
    { label: "Needs attention", colour: palette.warn },
    { label: "Failed", colour: palette.err },
    { label: "Idle", colour: palette.idle },
  ];
  return (
    <Box>
      <Typography variant="overline">State colours</Typography>
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 2, marginTop: 1 }}>
        {swatches.map(({ label, colour }) => (
          <Stack key={label} direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: colour,
                border: "1px solid",
                borderColor: "divider",
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
};
