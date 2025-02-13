import { Box, useMediaQuery } from "@mui/material";
import { theme } from "../../themes/theme";

export type SettingsElementProps = {
  children: React.ReactNode;
};
export const SettingsElement = ({ children }: SettingsElementProps) => {
  const useMobileLayout = useMediaQuery(theme.breakpoints.down("lg"));
  return <Box sx={{ display: "flex", width: useMobileLayout ? "100%" : theme.breakpoints.values.md }}>{children}</Box>;
};
