import MemoryIcon from "@mui/icons-material/Memory";
import CodeIcon from "@mui/icons-material/Code";
import SubjectIcon from "@mui/icons-material/Subject";
import PaletteIcon from "@mui/icons-material/Palette";
import DataObjectIcon from "@mui/icons-material/DataObject";
import DownloadIcon from "@mui/icons-material/Download";
import DownloadingIcon from "@mui/icons-material/Downloading";
import FolderIcon from "@mui/icons-material/Folder";
import NotificationsIcon from "@mui/icons-material/Notifications";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import RadarIcon from "@mui/icons-material/Radar";
import SettingsIcon from "@mui/icons-material/Settings";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import VideoSettingsIcon from "@mui/icons-material/VideoSettings";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { AppearanceSettingsForm } from "../../components/settings/appearance-settings-form.component.tsx";
import { AutomaticDownloadsSettingsForm } from "../../components/settings/automatic-download-settings-form.component";
import { ContentDetectionSettingsForm } from "../../components/settings/content-detection-settings-form.component";
import { ContentManagementSettingsForm } from "../../components/settings/content-management-settings.component";
import { DevSettingsForm } from "../../components/settings/dev-settings-form.component.tsx";
import { DfSettingsForm } from "../../components/settings/df-settings.component";
import { DownloadsSettingsForm } from "../../components/settings/downloads-settings.component";
import { MetadataSettingsForm } from "../../components/settings/metadata-settings-form.component";
import { NotificationSettingsForm } from "../../components/settings/notification-settings.component";
import { MediaServersSettingsForm } from "../../components/settings/media-servers-settings-form.component";
import ArticleIcon from "@mui/icons-material/Article";
import { AiAnalysisSettingsForm } from "../../components/settings/ai-analysis-settings-form.component";
import { DfArticlesSettingsForm } from "../../components/settings/df-articles-settings-form.component";
import { LoggingSettingsForm } from "../../components/settings/logging-settings-form.component";
import { LocalModelsSettingsForm } from "../../components/settings/local-models-settings-form.component";
import { ScheduledBackfillSettingsForm } from "../../components/settings/scheduled-backfill-settings-form.component";
import { SubtitlesSettingsForm } from "../../components/settings/subtitles-settings-form.component";
import { DfLogoIcon } from "../../icons/df-logo.component";
import { NestedRouteElement, NestedSubRoute } from "../nav/nested-routes.ts";
import { SettingsElement } from "./settings.component.tsx";
import { MediaFormatsSettingsForm } from "../../components/settings/media-format-settings-component.tsx";

/**
 * Wraps each page in the settings shell, leaving group nodes alone.
 *
 * Recursive rather than a flat map: groups carry no element of their own, so
 * mapping over them blindly wraps an undefined and drops the pages inside.
 */
const withSettingsShell = (routes: NestedRouteElement[]): NestedRouteElement[] =>
  routes.map((route) =>
    "routes" in route
      ? { ...route, routes: withSettingsShell(route.routes) }
      : { ...route, element: <SettingsElement>{route.element}</SettingsElement> }
  );

/**
 * Grouped by the life of a video - where it comes from, fetching it, what is
 * done to it afterwards, then the app itself.
 *
 * The grouping is presentation only and deliberately does not mirror
 * config.yaml: each page still binds to exactly one config section, and two
 * pages under one heading are no more related on disk than they were before.
 * Fourteen pages in a flat column had no order anyone could state, which is
 * the actual problem being solved.
 */
export const settingsRouteDefinitions: NestedSubRoute = {
  name: "Settings",
  icon: SettingsIcon,
  routes: withSettingsShell([
    {
      name: "Digital Foundry",
      routes: [
        {
          // Just the autologin cookie. "Digital Foundry" named the whole
          // group as much as this page, which said nothing about either.
          path: "/settings/df",
          element: <DfSettingsForm />,
          name: "Auth",
          icon: DfLogoIcon,
        },
        {
          path: "/settings/content-detection",
          element: <ContentDetectionSettingsForm />,
          name: "Content Detection",
          icon: RadarIcon,
        },
        {
          path: "/settings/df-articles",
          element: <DfArticlesSettingsForm />,
          name: "DF Articles",
          icon: ArticleIcon,
        },
      ],
    },
    {
      name: "Downloading",
      routes: [
        {
          path: "/settings/automatic-downloads",
          element: <AutomaticDownloadsSettingsForm />,
          name: "Automatic Downloads",
          icon: DownloadingIcon,
        },
        {
          path: "/settings/downloads",
          element: <DownloadsSettingsForm />,
          name: "Downloads",
          icon: DownloadIcon,
        },
        {
          path: "/settings/media-formats",
          element: <MediaFormatsSettingsForm />,
          name: "Media Formats",
          icon: VideoSettingsIcon,
        },
        {
          // Destination and work directories - where downloads are written,
          // which is part of fetching rather than of processing.
          path: "/settings/content-management",
          element: <ContentManagementSettingsForm />,
          name: "Content Management",
          icon: FolderIcon,
        },
      ],
    },
    {
      // The Activity page already calls these steps post-processing; using a
      // second word for the same operations would be the confusing part.
      name: "Post-processing",
      routes: [
        {
          path: "/settings/local-models",
          element: <LocalModelsSettingsForm />,
          name: "Local models",
          icon: MemoryIcon,
        },
        {
          path: "/settings/subtitles",
          element: <SubtitlesSettingsForm />,
          name: "Subtitles",
          icon: SubtitlesIcon,
        },
        {
          path: "/settings/ai-analysis",
          element: <AiAnalysisSettingsForm />,
          name: "AI Analysis",
          icon: AutoAwesomeIcon,
        },
        {
          // Its own route rather than a panel on the AI Analysis page: that
          // page is already long, and the run history is the part that most
          // wants the room. The AI Analysis page carries a link to it, so the
          // page people reach first still points at it - see mock-up 9.
          path: "/settings/scheduled-backfill",
          element: <ScheduledBackfillSettingsForm />,
          name: "Scheduled backfill",
          icon: ScheduleIcon,
        },
        {
          path: "/settings/metadata",
          element: <MetadataSettingsForm />,
          name: "Metadata",
          icon: DataObjectIcon,
        },
      ],
    },
    {
      name: "Application",
      routes: [
        {
          path: "/settings/notifications",
          element: <NotificationSettingsForm />,
          name: "Notifications",
          icon: NotificationsIcon,
        },
        {
          // Beside Notifications rather than under Post-processing: both are
          // about telling something outside the app, where post-processing is
          // work done to the file itself.
          path: "/settings/media-servers",
          element: <MediaServersSettingsForm />,
          name: "Media Servers",
          icon: VideoLibraryIcon,
        },
        {
          path: "/settings/appearance",
          element: <AppearanceSettingsForm />,
          name: "Appearance",
          icon: PaletteIcon,
        },
        {
          path: "/settings/logging",
          element: <LoggingSettingsForm />,
          name: "Logging",
          icon: SubjectIcon,
        },
        {
          path: "/settings/dev",
          element: <DevSettingsForm />,
          name: "Dev",
          icon: CodeIcon,
          devOnly: true,
        },
      ],
    },
  ]),
};
