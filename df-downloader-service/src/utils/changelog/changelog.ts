import { Changelog } from "df-downloader-common";
import YAML from "yaml";
import fs from "fs";

export const parseChangelog = (changelog: string): Changelog => {
    const changelogObj = YAML.parse(changelog);
    return Changelog.parse(changelogObj);
}

export const loadChangelogSync = (changelogPath: string): Changelog => {
    const changelog = fs.readFileSync(changelogPath, { encoding: "utf8" });
    return parseChangelog(changelog);
}

export const loadChangelog = async (changelogPath: string): Promise<Changelog> => {
    const changelog = await fs.promises.readFile(changelogPath, { encoding: "utf8" });
    return parseChangelog(changelog);
}