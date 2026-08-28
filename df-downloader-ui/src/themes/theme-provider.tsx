import { CssBaseline, ThemeProvider as MuiThemeProvider } from "@mui/material";
import { UiThemeName } from "df-downloader-common/config/ui-config";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { selectConfigSectionField } from "../store/config/config.selector";
import { buildTheme } from "./build-theme";
import { palettes } from "./palettes";
import { getStoredThemeName, hasStoredThemeName, storeThemeBackground, storeThemeName } from "./ui-preferences";

type ThemeChoiceContextValue = {
  themeName: UiThemeName;
  /** Applies immediately and remembers the choice in this browser. */
  setThemeName: (name: UiThemeName) => void;
};

const ThemeChoiceContext = createContext<ThemeChoiceContextValue>({
  themeName: getStoredThemeName(),
  setThemeName: () => {},
});

export const useThemeChoice = () => useContext(ThemeChoiceContext);

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // Read synchronously in the initialiser, not in an effect - an effect runs
  // after the first paint, which is exactly the flash of the wrong theme this
  // is here to avoid.
  const [themeName, setThemeNameState] = useState<UiThemeName>(() => getStoredThemeName());

  const setThemeName = useCallback((name: UiThemeName) => {
    storeThemeName(name);
    setThemeNameState(name);
  }, []);

  // The service config is the cross-browser copy of the same choice. It only
  // wins on a browser that has never picked one for itself - otherwise opening
  // the app on a machine you'd themed locally would yank it back to whatever
  // the last machine saved.
  const configThemeName = useSelector(selectConfigSectionField("ui", "theme"));
  useEffect(() => {
    if (configThemeName && !hasStoredThemeName() && palettes[configThemeName]) {
      storeThemeBackground(configThemeName);
      setThemeNameState(configThemeName);
    }
  }, [configThemeName]);

  const theme = useMemo(() => buildTheme(palettes[themeName] ?? palettes.signal), [themeName]);
  const contextValue = useMemo(() => ({ themeName, setThemeName }), [themeName, setThemeName]);

  return (
    <ThemeChoiceContext.Provider value={contextValue}>
      <MuiThemeProvider theme={theme}>
        {/*
          At the app root, not inside <Nav /> where it used to live - the auth
          and not-ready screens render outside the nav and were getting no
          baseline at all.
        */}
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeChoiceContext.Provider>
  );
};
