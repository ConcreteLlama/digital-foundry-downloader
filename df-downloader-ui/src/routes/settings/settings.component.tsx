import { Box, useMediaQuery,
  useTheme } from "@mui/material";

export type SettingsElementProps = {
  children: React.ReactNode;
};
export const SettingsElement = ({ children }: SettingsElementProps) => {
  const theme = useTheme();
  const useMobileLayout = useMediaQuery(theme.breakpoints.down("lg"));
  return <Box sx={{ display: "flex", width: useMobileLayout ? "100%" : theme.breakpoints.values.md }}>{children}</Box>;
};
