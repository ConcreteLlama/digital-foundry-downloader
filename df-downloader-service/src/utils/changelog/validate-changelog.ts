import { CURRENT_VERSION } from "../../version.js";
import { loadChangelogSync } from "./changelog.js";

const changelogFile = process.argv[2];
if (!changelogFile) {
    console.error("Usage: ensure-changelog <changelog-file>");
    process.exit(1);
}
const changelog = loadChangelogSync(changelogFile);
const latestVersion = changelog.versions[0].version;
if (latestVersion !== CURRENT_VERSION) {
    console.error(`Latest version in changelog is ${latestVersion}, but current version is ${CURRENT_VERSION}`);
    process.exit(1);
}