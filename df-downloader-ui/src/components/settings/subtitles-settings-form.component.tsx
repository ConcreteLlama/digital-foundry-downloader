import { SubtitlesConfig, SubtitlesService } from "df-downloader-common/config/subtitles-config";
import { DfSettingsSectionForm } from "./df-settings-section-form.component";
import { ZodSelectField } from "../zod-fields/zod-select-field.component";
import { useWatch } from "react-hook-form";
import { Fragment } from "react";
import { PasswordElement } from "react-hook-form-mui";

export const SubtitlesSettingsForm = () => {
  return (
    <DfSettingsSectionForm sectionName="subtitles" title="Subtitles">
      <SubtitlesSettings />
    </DfSettingsSectionForm>
  );
};

const SubtitlesSettings = () => {
  const subtitlesService = useWatch<SubtitlesConfig>({
    name: "subtitlesService",
  }) as string | null;
  return (
    <Fragment>
      <ZodSelectField
        name="subtitlesService"
        label={"Subtitles Service"}
        helperText="The service to use for downloading subtitles"
        zodEnum={SubtitlesService}
        nullable
      />
      {subtitlesService === "deepgram" && (
        <PasswordElement name="deepgram.apiKey" label="Deepgram API Key" helperText="The Deepgram API Key" />
      )}
    </Fragment>
  );
};
