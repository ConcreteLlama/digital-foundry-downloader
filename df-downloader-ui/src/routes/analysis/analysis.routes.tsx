import InsightsIcon from "@mui/icons-material/Insights";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import { GameIndexPage } from "../../components/analysis/game-index-page.component.tsx";
import { NestedSubRoute } from "../nav/nested-routes.tsx";

/**
 * Views that read across analysed content, rather than showing one item.
 *
 * A section of its own rather than a tab inside Content because the
 * subject is different: Content is a row per video, this is a view of the
 * analysis corpus. It holds one page today and is shaped to take more
 * (a settings knowledge base, a coverage summary, a console-comparison
 * ledger) without further nav churn - see
 * docs/AI_CONTENT_ANALYSIS_PLAN.md.
 */
export const analysisRouteDefinitions: NestedSubRoute = {
  name: "Analysis",
  icon: InsightsIcon,
  routes: [
    {
      path: "/analysis/games",
      element: <GameIndexPage />,
      name: "Games",
      icon: SportsEsportsIcon,
    },
  ],
};
