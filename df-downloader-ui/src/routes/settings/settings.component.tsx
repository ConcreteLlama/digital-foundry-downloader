import { Box, useMediaQuery,
  useTheme } from "@mui/material";

export type SettingsElementProps = {
  children: React.ReactNode;
};
/** Readable column width for a settings form - not a layout breakpoint. */
const SETTINGS_MAX_WIDTH = 900;

export const SettingsElement = ({ children }: SettingsElementProps) => {
  const theme = useTheme();
  // Full width until there is room to cap it. This is a max-width rule that
  // happens to be expressed in breakpoint terms, not a mobile/desktop switch -
  // which is why it keys off lg and not md like everything else.
  const fillWidth = useMediaQuery(theme.breakpoints.down("lg"));
  // flex:1 1 auto so the page fills the height NavPage gives it. Without
  // it this wrapper sits at its content height, which caps everything
  // inside - the settings save bar cannot reach the bottom of the screen
  // however the form itself is laid out, because this box ends first.
  return (
    <Box
      sx={{
        display: "flex",
        // Column, because a settings page stacks. This defaulted to row, so
        // a page returning more than one root element got them side by side
        // - which is what pushed the Dev page's fixture panel off the screen
        // and scrolled the whole page sideways on a phone.
        flexDirection: "column",
        flex: "1 1 auto",
        width: fillWidth ? "100%" : SETTINGS_MAX_WIDTH,
      }}
    >
      {children}
    </Box>
  );
};
