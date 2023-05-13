import { ListItemButton, ListItemIcon, ListItemText, SvgIconProps, SxProps } from "@mui/material";
import { Link } from "react-router-dom";

export type NavItemProps = {
  to: string;
  text: string;
  icon?: React.FC<SvgIconProps>;
  children?: React.ReactNode;
  sx?: SxProps;
  onItemSelected?: () => void;
};

export const NavItem = ({ to, text, icon: IconComponent, children, sx = {}, onItemSelected }: NavItemProps) => {
  return (
    <ListItemButton component={Link} to={to} sx={sx} onClick={onItemSelected}>
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
