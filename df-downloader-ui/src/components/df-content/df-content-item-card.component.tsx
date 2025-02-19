import { CardActionArea, CardActions, Divider, Typography } from "@mui/material";
import { HoverOverCard } from "../general/hover-card.component";
import { DfContentInfoItem } from "./df-content-info-item.component.tsx";
import { DfContentAvailabilitySummary } from "./df-content-status-summary.component";
import { useDfContentEntry } from "../../hooks/use-df-content-entry.ts";

export type DfContentInfoItemCardProps = {
  dfContentName: string;
  onClick: () => void;
};

export const DfContentInfoItemCard = ({ dfContentName, onClick }: DfContentInfoItemCardProps) => {
  const dfContentEntry = useDfContentEntry(dfContentName);
  if (!dfContentEntry) {
    return <Typography>ERROR</Typography>;
  }
  return (
    <HoverOverCard
      sx={{
        borderBottom: "1px solid",
        borderColor: "secondary.main",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-around",
      }}
    >
      <CardActionArea onClick={onClick} sx={{ marginBottom: 0 }}>
        <DfContentInfoItem dfContentName={dfContentName} />
      </CardActionArea>
      <Divider sx={{ width: "90%" }} />
      <CardActions
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <DfContentAvailabilitySummary content={dfContentEntry} />
      </CardActions>
    </HoverOverCard>
  );
};
