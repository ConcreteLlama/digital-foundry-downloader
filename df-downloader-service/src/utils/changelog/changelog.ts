import { Changelog, parseChangelog } from "df-downloader-common";
import fs from "fs";

export const loadChangelogSync = (changelogPath: string): Changelog => {
    const changelog = fs.readFileSync(changelogPath, { encoding: "utf8" });
    return parseChangelog(changelog);
}

export const loadChangelog = async (changelogPath: string): Promise<Changelog> => {
    const changelog = await fs.promises.readFile(changelogPath, { encoding: "utf8" });
    return parseChangelog(changelog);
}