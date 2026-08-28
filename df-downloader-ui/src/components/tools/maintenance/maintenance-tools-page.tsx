import { Box, Card, CardActions, CardContent, CardHeader, useMediaQuery,
  useTheme } from "@mui/material";
import { MaintenanceTools } from "./maintenance-tools";

export const MaintenanceToolsPage = () => {
  const theme = useTheme();
  const isBelowMd = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box sx={{ padding: 2 }}>
      {
        Object.entries(MaintenanceTools).map(([name, { button, view }]) => (
          <Card key={name} variant="elevation" sx={{ marginBottom: 2, width: isBelowMd ? '100%' : '60vw' }}>
            <CardHeader title={name} sx={{ textAlign: 'center' }} />
            <CardContent sx={{ display: 'flex', justifyContent: 'center' }}>
                {view}
            </CardContent>
            <CardActions sx={{ justifyContent: 'center' }}>
              {button}
            </CardActions>
          </Card>
        ))
      }
    </Box>
  );
};