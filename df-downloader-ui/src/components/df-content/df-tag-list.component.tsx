import { Box } from "@mui/system";
import { Chip, SxProps } from "@mui/material";

export type DfTagListProps = {
  tags: string[];
  sx?: SxProps;
};

export const DfTagList = ({ tags, sx = {} }: DfTagListProps) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: 1,
        ...sx,
      }}
    >
      {tags.map((tag) => (
        <Chip label={`${tag}`} variant="outlined" key={`tag-info-${tag}`} />
      ))}
    </Box>
  );
};
