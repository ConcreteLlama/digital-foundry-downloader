import { fetchContentInfo } from "../df-fetcher.js";
import { serviceLocator } from "../services/service-locator.js";
import { taskify } from "../task-manager/utils.js";

export const refreshContentInfo = async(contentName: string) => {
    const { contentInfo } = await fetchContentInfo(contentName);
    if (!contentInfo) {
        return null;
    }
    const db = serviceLocator.db;
    await db.setContentInfos([contentInfo]);
    return contentInfo;
}

export const RefreshContentInfoTask = taskify(refreshContentInfo);