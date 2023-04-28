import { ListItemButton, ListItemIcon, ListItemText, SvgIconProps, SxProps } from "@mui/material";
import { Link } from "react-router-dom";

export type NavItemProps = {
  to: string;
  text: string;
  icon?: React.FC<SvgIconProps>;
  children?: React.ReactNode;
  sx?: SxProps;
};

export const NavItem = ({ to, text, icon: IconComponent, children, sx = {} }: NavItemProps) => {
  return (
    <ListItemButton component={Link} to={to} sx={sx}>
      {IconComponent && (
        <ListItemIcon>
          <IconComponent color="primary" />
        </ListItemIcon>
      )}
      <ListItemText primary={text} />
      {children}
    </ListItemButton>
  );
};
