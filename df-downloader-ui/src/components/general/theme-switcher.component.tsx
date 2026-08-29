import CheckIcon from "@mui/icons-material/Check";
import PaletteIcon from "@mui/icons-material/Palette";
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { UiThemeName, uiThemeNames } from "df-downloader-common/config/ui-config";
import { useState } from "react";
import { palettes } from "../../themes/palettes";
import { useThemeChoice } from "../../themes/theme-provider";

/**
 * A theme drawn in its own colours.
 *
 * Names alone ("Signal", "Foundry", "Paper") say nothing about what you are
 * choosing, and a single colour dot says almost as little - what distinguishes
 * these palettes is the relationship between page, panel and accent, not any
 * one hue. So this is a miniature of the app: page background, a panel with
 * its own border, and the accent against muted text.
 *
 * Every value comes from the palette itself, so a fourth theme added to
 * ui-config.ts previews correctly without anything here changing.
 */
const ThemeSwatch = ({ name }: { name: UiThemeName }) => {
  const palette = palettes[name];
  return (
    <Box
      aria-hidden
      sx={{
        width: 46,
        height: 30,
        flexShrink: 0,
        borderRadius: 0.75,
        overflow: "hidden",
        border: "1px solid",
        borderColor: palette.line2,
        backgroundColor: palette.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ height: 9, backgroundColor: palette.surface, borderBottom: `1px solid ${palette.line}` }} />
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 0.5, paddingX: 0.625 }}>
        <Box sx={{ width: 9, height: 4, borderRadius: 2, backgroundColor: palette.accent }} />
        <Box sx={{ width: 16, height: 4, borderRadius: 2, backgroundColor: palette.ink3 }} />
      </Box>
    </Box>
  );
};

/**
 * Switches theme from the top bar.
 *
 * The choice is this browser's, matching setThemeName's existing contract -
 * Settings holds the cross-browser default, and a local pick deliberately wins
 * over it so theming one machine doesn't reach across to another.
 */
export const ThemeSwitcher = () => {
  const { themeName, setThemeName } = useThemeChoice();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title="Theme">
        <IconButton
          aria-label="Change theme"
          aria-haspopup="true"
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ width: 44, height: 44 }}
        >
          <PaletteIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {uiThemeNames.map((name) => {
          const selected = name === themeName;
          return (
            <MenuItem
              key={name}
              selected={selected}
              onClick={() => {
                setThemeName(name);
                setAnchor(null);
              }}
              sx={{ gap: 1.5, minWidth: 200 }}
            >
              <ThemeSwatch name={name} />
              <Typography sx={{ flex: "1 1 auto", fontSize: "0.875rem" }}>{palettes[name].label}</Typography>
              {/* The label stays in the CURRENT theme's ink - a menu whose text
                  is drawn in three different palettes is a legibility problem,
                  not a preview. The swatch is where each theme speaks. */}
              <CheckIcon
                sx={{ fontSize: 16, flexShrink: 0, opacity: selected ? 1 : 0, color: "primary.main" }}
              />
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
};
