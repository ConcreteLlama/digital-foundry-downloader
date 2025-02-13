import { CSSObject, Theme } from "@mui/material";
import { theme } from "../themes/theme.ts";

export const getScrollbarStyles = (theme: Theme): CSSObject => ({
  '&::-webkit-scrollbar': {
    width: '8px',
    height: '8px',
  },
  '&::-webkit-scrollbar-track': {
    background: theme.palette.background.default,
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb': {
    background: theme.palette.grey[500],
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    background: theme.palette.grey[700],
  },
  scrollbarWidth: 'thin', // For Firefox
  scrollbarColor: `${theme.palette.grey[500]} ${theme.palette.background.default}`, // For Firefox
});

export const generalScrollbarProps = getScrollbarStyles(theme);