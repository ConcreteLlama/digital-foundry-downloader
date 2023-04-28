import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#5184b1",
    },
    secondary: {
      main: "#1e88e5",
    },
    background: {
      default: "#0b0f16",
      paper: "#101620",
    },
    text: {
      primary: "#ffffff",
      secondary: "#bdbdbd",
    },
  },
  typography: {
    fontFamily: "'Roboto', 'Helvetica', 'Arial', sans-serif",
    h1: {
      fontWeight: 300,
      fontSize: "6rem",
    },
    h2: {
      fontWeight: 400,
      fontSize: "3.75rem",
    },
    h3: {
      fontWeight: 400,
      fontSize: "3rem",
    },
    h4: {
      fontWeight: 400,
      fontSize: "2.125rem",
    },
    h5: {
      fontWeight: 400,
      fontSize: "1.5rem",
    },
    h6: {
      fontWeight: 500,
      fontSize: "1.25rem",
    },
    body1: {
      fontSize: "1rem",
    },
    body2: {
      fontSize: "0.875rem",
    },
    caption: {
      fontSize: "0.75rem",
    },
  },
});
