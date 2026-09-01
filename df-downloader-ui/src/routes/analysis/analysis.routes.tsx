import InsightsIcon from "@mui/icons-material/Insights";
import MemoryIcon from "@mui/icons-material/Memory";
import PaidIcon from "@mui/icons-material/Paid";
import TuneIcon from "@mui/icons-material/Tune";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import TableChartIcon from "@mui/icons-material/TableChart";
import { GameIndexPage } from "../../components/analysis/game-index-page.component.tsx";
import { CostsPage } from "../../components/analysis/costs-page.component.tsx";
import { HardwarePage } from "../../components/analysis/hardware-page.component.tsx";
import { PcSettingsPage } from "../../components/analysis/pc-settings-page.component.tsx";
import { PlatformComparisonPage } from "../../components/analysis/platform-comparison-page.component.tsx";
import { NestedSubRoute } from "../nav/nested-routes.tsx";

/**
 * Views that read across analysed content, rather than showing one item.
 *
 * A section of its own rather than a tab inside Content because the
 * subject is different: Content is a row per video, this is a view of the
 * analysis corpus. The settings knowledge base and hardware index this was
 * shaped for now exist; a coverage summary and a tag review queue are the
 * remaining candidates - see docs/AI_CONTENT_ANALYSIS_PLAN.md.
 */
export const analysisRouteDefinitions: NestedSubRoute = {
  name: "Analysis",
  icon: InsightsIcon,
  // These pages are wide - a comparison table with a column per platform
  // in particular - so a second vertical nav beside the rail takes width
  // the content needs, to choose between two pages.
  compactNavOnly: true,
  /*
   * Games first: it is the broadest view - everything analysed, grouped by
   * what it was about - so it is the one that answers "what do I have on this
   * game" without knowing which specialised view to look in. The three after
   * it are narrower cuts of the same corpus, and Costs is last because it is
   * about running the feature rather than about any content.
   */
  routes: [
    {
      path: "/analysis/games",
      element: <GameIndexPage />,
      name: "Games",
      icon: SportsEsportsIcon,
    },
    {
      path: "/analysis/platform-comparisons",
      element: <PlatformComparisonPage />,
      name: "Platform Comparisons",
      icon: TableChartIcon,
    },
    {
      path: "/analysis/pc-settings",
      element: <PcSettingsPage />,
      name: "PC Settings",
      icon: TuneIcon,
    },
    {
      path: "/analysis/hardware",
      element: <HardwarePage />,
      name: "Hardware",
      icon: MemoryIcon,
    },
    {
      path: "/analysis/costs",
      element: <CostsPage />,
      name: "Costs",
      icon: PaidIcon,
    },
  ],
};
