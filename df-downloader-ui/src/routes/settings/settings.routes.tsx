import CodeIcon from "@mui/icons-material/Code";
import DataObjectIcon from "@mui/icons-material/DataObject";
import DownloadIcon from "@mui/icons-material/Download";
import DownloadingIcon from "@mui/icons-material/Downloading";
import FolderIcon from "@mui/icons-material/Folder";
import NotificationsIcon from "@mui/icons-material/Notifications";
import RadarIcon from "@mui/icons-material/Radar";
import SettingsIcon from "@mui/icons-material/Settings";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import { AutomaticDownloadsSettingsForm } from "../../components/settings/automatic-download-settings-form.component";
import { ContentDetectionSettingsForm } from "../../components/settings/content-detection-settings-form.component";
import { ContentManagementSettingsForm } from "../../components/settings/content-management-settings.component";
import { DevSettingsForm } from "../../components/settings/dev-settings-form.component.tsx";
import { DfSettingsForm } from "../../components/settings/df-settings.component";
import { DownloadsSettingsForm } from "../../components/settings/downloads-settings.component";
import { MetadataSettingsForm } from "../../components/settings/metadata-settings-form.component";
import { NotificationSettingsForm } from "../../components/settings/notification-settings.component";
import { SubtitlesSettingsForm } from "../../components/settings/subtitles-settings-form.component";
import { DfLogoIcon } from "../../icons/df-logo.component";
import { NestedSubRoute } from "../nav/nested-routes.ts";
import { SettingsElement } from "./settings.component.tsx";

export const settingsRouteDefinitions: NestedSubRoute = {
  name: "Settings",
  icon: SettingsIcon,
  routes: [
    {
      path: "/settings/df",
      element: <DfSettingsForm />,
      name: "Digital Foundry",
      icon: DfLogoIcon,
    },
    {
      path: "/settings/content-detection",
      element: <ContentDetectionSettingsForm />,
      name: "Content Detection",
      icon: RadarIcon,
    },
    {
      path: "/settings/automatic-downloads",
      element: <AutomaticDownloadsSettingsForm />,
      name: "Automatic Downloads",
      icon: DownloadingIcon,
    },
    {
      path: "/settings/content-management",
      element: <ContentManagementSettingsForm />,
      name: "Content Management",
      icon: FolderIcon,
    },
    {
      path: "/settings/downloads",
      element: <DownloadsSettingsForm />,
      name: "Downloads",
      icon: DownloadIcon,
    },
    {
      path: "/settings/metadata",
      element: <MetadataSettingsForm />,
      name: "Metadata",
      icon: DataObjectIcon,
    },
    {
      path: "/settings/subtitles",
      element: <SubtitlesSettingsForm />,
      name: "Subtitles",
      icon: SubtitlesIcon,
    },
    {
      path: "/settings/notifications",
      element: <NotificationSettingsForm />,
      name: "Notifications",
      icon: NotificationsIcon,
    },
    {
      path: "/settings/dev",
      element: <DevSettingsForm />,
      name: "Dev",
      icon: CodeIcon,
      devOnly: true,
    },
  ].map((route) => ({ ...route, element: <SettingsElement>{route.element}</SettingsElement> })),
};
