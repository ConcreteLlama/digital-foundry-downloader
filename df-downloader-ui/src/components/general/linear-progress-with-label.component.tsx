import { Box, LinearProgress, LinearProgressProps, Typography } from "@mui/material";

export const LinearProgressWithLabel = (props: LinearProgressProps & { value: number }) => {
  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Box sx={{ width: "100%", mr: 1 }}>
        <LinearProgress variant="determinate" {...props} sx={{ minWidth: "30vh" }} />
      </Box>
      <Box sx={{ minWidth: 30 }}>
        <Typography variant="body2" color="text.secondary" align="right">{`${Math.round(props.value)}%`}</Typography>
      </Box>
    </Box>
  );
};
