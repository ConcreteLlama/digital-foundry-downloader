import { DeepgramLogo } from "./deepgram-logo.component.tsx";
import GoogleIcon from "@mui/icons-material/Google";
import YoutubeIcon from "@mui/icons-material/YouTube";
import SubtitlesIcon from "@mui/icons-material/Subtitles";

export const selectSubtitlesIcon = (subtitlesService: string) => {
  switch (subtitlesService) {
    case "deepgram":
      return DeepgramLogo;
    case "google_stt":
      return GoogleIcon;
    case "youtube":
      return YoutubeIcon;
    default:
      return SubtitlesIcon;
  }
};
