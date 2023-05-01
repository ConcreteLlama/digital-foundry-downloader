import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Button, CircularProgress, Divider, Typography, styled } from "@mui/material";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config";
import { FormContainer, useFormState } from "react-hook-form-mui";
import { useSelector } from "react-redux";
import { selectConfigError, selectConfigLoading, selectConfigSection } from "../../store/config/config.selector";
import { store } from "../../store/store";
import { queryConfigSection, updateConfigSection } from "../../store/config/config.action";
import { createContext, useEffect } from "react";

export const CurrentSettingsContext = createContext<Partial<DfDownloaderConfig>>({});

export type DfSettingsFormProps = {
  sectionName: keyof DfDownloaderConfig;
  title: string;
  children: React.ReactNode;
};

export const DfSettingsSectionForm = (props: DfSettingsFormProps) => {
  const { sectionName, title, children } = props;
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
    return <CircularProgress />;
  } else {
    return (
      <CurrentSettingsContext.Provider
        value={{
          [sectionName]: currentSettings,
        }}
      >
        <Box sx={{ width: "50rem", height: "100%" }}>
          <Typography variant="h5">{title}</Typography>
          <Divider sx={{ marginTop: 2, marginBottom: 4 }} />
          <FormContainer
            resolver={zodResolver(zodSchema)}
            defaultValues={currentSettings as any}
            onSuccess={(data) => {
              console.log("dispatching", data);
              store.dispatch(updateConfigSection.start({ section: sectionName, value: data }));
            }}
            onError={(error) => {
              console.log("error", error);
            }}
          >
            <SettingsStack>
              {children}
              <SubmitButton />
            </SettingsStack>
          </FormContainer>
        </Box>
      </CurrentSettingsContext.Provider>
    );
  }
};

const SubmitButton = () => {
  const { isDirty } = useFormState();
  return (
    <Button disabled={!isDirty} type="submit" variant="contained">
      Save
    </Button>
  );
};

export const SettingsStack = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(4),
}));
