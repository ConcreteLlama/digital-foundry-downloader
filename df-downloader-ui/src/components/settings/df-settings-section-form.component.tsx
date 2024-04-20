import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Button, Divider, Typography, styled } from "@mui/material";
import { logger } from "df-downloader-common";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config";
import { createContext, useEffect } from "react";
import { FormContainer, useFormState } from "react-hook-form-mui";
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
