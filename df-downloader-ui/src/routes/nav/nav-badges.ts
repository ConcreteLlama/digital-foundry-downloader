import { useSelector } from "react-redux";
import { selectTotalContentItems } from "../../store/df-content/df-content.selector";
import { selectDownloadingPipelineIds, selectPostProcessingPipelineIds } from "../../store/df-tasks/tasks.selector";
import { NavDestination } from "./nav-destinations";

/**
 * The counts shown against rail destinations. Both come from state the app
 * already holds - the content total from the last search response, the
 * activity count from the live task pipelines - so this adds no requests.
 */
export const useNavBadge = (destination: NavDestination): string | undefined => {
  const totalContent = useSelector(selectTotalContentItems);
  const downloadingIds = useSelector(selectDownloadingPipelineIds);
  const postProcessingIds = useSelector(selectPostProcessingPipelineIds);

  if (destination.badge === "content") {
    return totalContent > 0 ? totalContent.toLocaleString() : undefined;
  }
  if (destination.badge === "activity") {
    const active = downloadingIds.length + postProcessingIds.length;
    return active > 0 ? String(active) : undefined;
  }
  return undefined;
};
