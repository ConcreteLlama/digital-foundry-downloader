import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";

export const SettingsPage = () => {
  // const [value, setValue] = React.useState("1");
  // const handleChange = (event: React.SyntheticEvent, newValue: string) => {
  //   setValue(newValue);
  // };
  return (
    <Box sx={{ display: "flex", padding: 4 }}>
      {/* <TabContext value={value}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={value} onChange={handleChange} aria-label="lab API tabs example">
            {settingsRoutes.map((route) => (
              <Tab label={route.name} value={route.path} />
            ))}
          </Tabs>
        </Box>
        {settingsRoutes.map((route) => (
          <TabPanel value={route.path}>{route.element}</TabPanel>
        ))}
      </TabContext> */}
      <Outlet />
    </Box>
  );
};
