import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Button, Divider, Typography, styled } from "@mui/material";
import { logger } from "df-downloader-common";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config";
import { createContext, useEffect } from "react";
import { setSectionDirty } from "./dirty-sections";
import { FormContainer, useFormContext, useFormState } from "react-hook-form-mui";
import { useSelector } from "react-redux";
import { queryConfigSection, updateConfigSection } from "../../store/config/config.action";
import { selectConfigError, selectConfigLoading, selectConfigSection } from "../../store/config/config.selector";
import { store } from "../../store/store";
import { Loading } from "../general/loading.component.tsx";

export const CurrentSettingsContext = createContext<Partial<DfDownloaderConfig>>({});

export type DfSettingsFormProps = {
  sectionName: keyof DfDownloaderConfig;
  title: string;
  children: React.ReactNode;
  onSubmit?: () => void;
};

export const DfSettingsSectionForm = ({ sectionName, title, children, onSubmit }: DfSettingsFormProps) => {
  useEffect(() => {
    store.dispatch(queryConfigSection.start(sectionName));
  }, [sectionName]);
  const currentSettings = useSelector(selectConfigSection(sectionName));
  const configLoading = useSelector(selectConfigLoading);
  const configError = useSelector(selectConfigError);
  const zodSchema = DfDownloaderConfig.shape[sectionName];
  if (configError) {
    return <Typography>{configError.message}</Typography>;
  } else if (configLoading || !currentSettings) {
    return <Loading />;
  } else {
    return (
      <CurrentSettingsContext.Provider
        value={{
          [sectionName]: currentSettings,
        }}
      >
        <Box sx={{ height: "100%", width: "100%" }}>
          <Typography variant="h5">{title}</Typography>
          <Divider sx={{ marginTop: 2, marginBottom: 4 }} />
          <FormContainer
            resolver={zodResolver(zodSchema)}
            defaultValues={currentSettings as any}
            onSuccess={(data) => {
              store.dispatch(updateConfigSection.start({ section: sectionName, value: data }));
              onSubmit?.();
            }}
            onError={(error) => {
              logger.log("error", error);
            }}
          >
            <SettingsStack>
              {children}
            </SettingsStack>
            <StickySaveBar sectionName={sectionName} />
          </FormContainer>
        </Box>
      </CurrentSettingsContext.Provider>
    );
  }
};

type InlineDfSettingsSectionProps = {
  sectionName: keyof DfDownloaderConfig;
  children: React.ReactNode;
  onSubmit?: () => void;
};
/**
 * This is a smaller version of the DfSettingsSectionForm that is meant to be used inline with other components (e.g. if just wanting to update a single field).
 * It does not include a title, divider or submit button.
 */
export const InlineDfSettingsSection = ({ sectionName, children, onSubmit }: InlineDfSettingsSectionProps) => {
  useEffect(() => {
    store.dispatch(queryConfigSection.start(sectionName));
  }, [sectionName]);
  const currentSettings = useSelector(selectConfigSection(sectionName));
  const configLoading = useSelector(selectConfigLoading);
  const configError = useSelector(selectConfigError);
  const zodSchema = DfDownloaderConfig.shape[sectionName];
  if (configError) {
    return <Typography>{configError.message}</Typography>;
  } else if (configLoading || !currentSettings) {
    return <Loading />;
  } else {
    return (
      <CurrentSettingsContext.Provider
        value={{
          [sectionName]: currentSettings,
        }}
      >
        <FormContainer
          resolver={zodResolver(zodSchema)}
          defaultValues={currentSettings as any}
          onSuccess={(data) => {
            store.dispatch(updateConfigSection.start({ section: sectionName, value: data }));
            onSubmit?.();
          }}
          onError={(error) => {
            logger.log("error", error);
          }}
        >
          {children}
        </FormContainer>
      </CurrentSettingsContext.Provider>
    );
  }
}

/**
 * The Save button used to sit at the bottom of the settings stack, which on a
 * long section meant scrolling to the end to find out whether it was even
 * enabled - i.e. whether you had actually changed anything. It sticks to the
 * bottom of the form now and says how many fields are pending, and it also
 * publishes the dirty flag so the sub-nav can mark the section.
 */
const StickySaveBar = ({ sectionName }: { sectionName: keyof DfDownloaderConfig }) => {
  const { isDirty, dirtyFields } = useFormState();
  const { reset } = useFormContext();
  useEffect(() => {
    setSectionDirty(sectionName, isDirty);
  }, [sectionName, isDirty]);
  // Clear the marker when the form unmounts, or navigating away would leave a
  // dot on a section that is no longer holding anything.
  useEffect(() => () => setSectionDirty(sectionName, false), [sectionName]);

  const changedCount = Object.keys(dirtyFields || {}).length;
  return (
    <Box
      sx={{
        position: "sticky",
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 2,
        marginTop: 4,
        paddingY: 1.5,
        backgroundColor: "background.default",
        borderTop: "1px solid",
        borderColor: "divider",
        zIndex: 1,
      }}
    >
      <Typography variant="body2" color={isDirty ? "text.secondary" : "text.disabled"}>
        {isDirty ? `${changedCount} unsaved change${changedCount === 1 ? "" : "s"}` : "No changes"}
      </Typography>
      <Button disabled={!isDirty} variant="outlined" onClick={() => reset()}>
        Discard
      </Button>
      <Button disabled={!isDirty} type="submit" variant="contained">
        Save
      </Button>
    </Box>
  );
};

export const SettingsStack = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(4),
}));
