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
  return <Box sx={{ display: "flex", width: fillWidth ? "100%" : SETTINGS_MAX_WIDTH }}>{children}</Box>;
};
