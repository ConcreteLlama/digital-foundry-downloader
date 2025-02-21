import { changelogToMarkdown } from "df-downloader-common";
import fs from "fs";
import { loadChangelogSync } from "./changelog.js";

const changelogInputFile = process.argv[2];
const changelogOutputFile = process.argv[3];
if (!changelogInputFile || !changelogOutputFile) {
  console.error("Usage: build-changelog <input-file> <output-file>");
  process.exit(1);
}

const changelog = loadChangelogSync(changelogInputFile);
fs.writeFileSync(changelogOutputFile, changelogToMarkdown(changelog), { encoding: "utf8" });