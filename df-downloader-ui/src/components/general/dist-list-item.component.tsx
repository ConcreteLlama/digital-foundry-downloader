import { ListItem } from "@mui/material";

export const DiscListItem = (props: React.ComponentProps<typeof ListItem>) => {
  return (
    <ListItem
      sx={{
        ...(props.sx || {}),
        display: "list-item",
        listStyleType: "disc",
        marginLeft: "1rem",
      }}
      {...props}
    />
  );
};
