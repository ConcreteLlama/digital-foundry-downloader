import { ContentManagementSettingsForm } from "../../components/settings/content-management-settings.component";
import { DfSettingsForm } from "../../components/settings/df-settings.component";
import { DownloadsSettingsForm } from "../../components/settings/downloads-settings.component";
import DownloadIcon from "@mui/icons-material/Download";
import FolderIcon from "@mui/icons-material/Folder";
import { DfLogoIcon } from "../../icons/df-logo.component";
import React from "react";
import { MetadataSettingsForm } from "../../components/settings/metadata-settings-form.component";
import SettingsIcon from "@mui/icons-material/Settings";
import DataObjectIcon from "@mui/icons-material/DataObject";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import RadarIcon from "@mui/icons-material/Radar";
import DownloadingIcon from "@mui/icons-material/Downloading";
import { SubtitlesSettingsForm } from "../../components/settings/subtitles-settings-form.component";
import { ContentDetectionSettingsForm } from "../../components/settings/content-detection-settings-form.component";
import { AutomaticDownloadsSettingsForm } from "../../components/settings/automatic-download-settings-form.component";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { NotificationSettingsForm } from "../../components/settings/notification-settings.component";

//TODO: Get a digital foundry icon svg

export type SettingsRoute = {
  path: string;
  element: JSX.Element;
  name: string;
  icon?: React.FC;
};
export const isSettingsRoute = (route: SettingsRouteElement): route is SettingsRoute => {
  return (route as SettingsRoute).path !== undefined;
};

export type SettingsSubRoute = {
  name: string;
  icon?: React.FC;
  routes: SettingsRouteElement[];
};
export const isSettingsSubRoute = (route: SettingsRouteElement): route is SettingsSubRoute => {
  return (route as SettingsSubRoute).routes !== undefined;
};

export type SettingsRouteElement = SettingsRoute | SettingsSubRoute;

export const settingsRoutes: SettingsSubRoute = {
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
  ],
};
