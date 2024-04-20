import { Box, useMediaQuery } from "@mui/material";
import { Outlet } from "react-router-dom";
import { theme } from "../../themes/theme";

export const SettingsPage = () => {
  return (
    <Box sx={{ display: "flex", padding: 4 }}>
      <Outlet />
    </Box>
  );
};

export type SettingsElementProps = {
  children: React.ReactNode;
};
export const SettingsElement = ({ children }: SettingsElementProps) => {
  const useMobileLayout = useMediaQuery(theme.breakpoints.down("lg"));
  return <Box sx={{ display: "flex", width: useMobileLayout ? "100%" : theme.breakpoints.values.md }}>{children}</Box>;
};
