import InsightsIcon from "@mui/icons-material/Insights";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import TableChartIcon from "@mui/icons-material/TableChart";
import { GameIndexPage } from "../../components/analysis/game-index-page.component.tsx";
import { PlatformComparisonPage } from "../../components/analysis/platform-comparison-page.component.tsx";
import { NestedSubRoute } from "../nav/nested-routes.tsx";

/**
 * Views that read across analysed content, rather than showing one item.
 *
 * A section of its own rather than a tab inside Content because the
 * subject is different: Content is a row per video, this is a view of the
 * analysis corpus. Shaped to take more pages (a settings knowledge base, a
 * coverage summary, a tag review queue) without further nav churn - see
 * docs/AI_CONTENT_ANALYSIS_PLAN.md for the ranked list.
 */
export const analysisRouteDefinitions: NestedSubRoute = {
  name: "Analysis",
  icon: InsightsIcon,
  routes: [
    {
      path: "/analysis/platform-comparisons",
      element: <PlatformComparisonPage />,
      name: "Platform Comparisons",
      icon: TableChartIcon,
    },
    {
      path: "/analysis/games",
      element: <GameIndexPage />,
      name: "Games",
      icon: SportsEsportsIcon,
    },
  ],
};
