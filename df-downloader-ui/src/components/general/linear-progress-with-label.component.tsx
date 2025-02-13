import { Box, LinearProgress, LinearProgressProps, Typography } from "@mui/material";

type LinearProgressWithLabelProps = LinearProgressProps & {
  label?: string;
  value: number;
  labelPosition?: "left" | "right" | "top" | "bottom";
}
export const LinearProgressWithLabel = (props: LinearProgressWithLabelProps) => {
  const { labelPosition = "right", label, value, ...linearProgressProps } = props;
  const displayLabel = label ?? `${Math.round(value)}%`;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexDirection: labelPosition === "top" ? "column-reverse" : labelPosition === "bottom" ? "column" : "row",
        gap: 1,
        position: "relative",
        width: "100%",
        ...props.sx,
      }}
    >
      {labelPosition === "left" && (
        <Typography variant="body2" color="text.secondary" align="right" sx={{ minWidth: 30 }}>
          {displayLabel}
        </Typography>
      )}
      <Box sx={{ width: "100%", mr: labelPosition === "right" ? 1 : 0 }}>
        <LinearProgress variant="determinate" value={value} {...linearProgressProps} sx={{
          width: "100%"
        }}/>
      </Box>
      {(labelPosition === "right" || labelPosition === "top" || labelPosition === "bottom") && (
        <Typography
          variant="body2"
          color="text.secondary"
          align="right"
          sx={{
            minWidth: 30,
            position: labelPosition === "top" || labelPosition === "bottom" ? "absolute" : "static",
            top: labelPosition === "top" ? "-1.5rem" : "auto",
            bottom: labelPosition === "bottom" ? "-1.5rem" : "auto",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          {displayLabel}
        </Typography>
      )}
    </Box>
  );
};