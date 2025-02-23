import { z } from 'zod';
import { ZSemVer } from '../utils/zod.js';
import semver from 'semver';

const ChangeEntriesType = z.enum(["bugfixes", "features", "enhancements", "security", "breaking", "misc"]);
type ChangeEntriesType = z.infer<typeof ChangeEntriesType>;

const changeEntryNameMap: Record<ChangeEntriesType, string> = {
    bugfixes: "Bug Fixes",
    features: "Features",
    enhancements: "Enhancements",
    security: "Security",
    breaking: "Breaking Changes",
    misc: "Miscellaneous",
}

type ChangeEntry = string | Record<string, ChangeEntry[]>;
const ChangeEntry: z.ZodType<ChangeEntry> = z.lazy(() =>
    z.union([
        z.string(),
        z.record(z.array(ChangeEntry)),
    ])
);

const ChangelogVersionEntry = z.object({
    version: ZSemVer,
    date: z.string(),
    notes: z.string().optional(),
    changes: z.record(ChangeEntriesType, z.array(ChangeEntry)).optional(),
    known_issues: ChangeEntry.array().optional(),
});

export const Changelog = z.object({
    versions: z.array(ChangelogVersionEntry),
});
export type Changelog = z.infer<typeof Changelog>;

const changeEntryToMarkdown = (change: ChangeEntry, level: number): string => {
    if (typeof change === 'string') {
        return `${'  '.repeat(level)}- ${change}\n`;
    } else {
        return Object.entries(change).reduce((acc: string[], [key, value]) => {
            acc.push(`${'  '.repeat(level)}- ${key}\n`);
            acc.push(...value.reduce((acc: string[], subChange) => {
                acc.push(changeEntryToMarkdown(subChange, level + 1));
                return acc;
            }, []));
            return acc;
        }, []).join('');
    }
};

const getVersionBadge = (version: string, currentVersion: string, latestVersion: string): string => {
    if (version === currentVersion && version === latestVersion) {
        return `![Current](https://img.shields.io/badge/current-grey) ![Latest](https://img.shields.io/badge/latest-brightgreen)`;
    } else if (version === currentVersion) {
        return `![Current](https://img.shields.io/badge/current-grey) ![Update Available](https://img.shields.io/badge/update%20available-blue)`;
    } else if (version === latestVersion) {
        return `![Not Installed](https://img.shields.io/badge/not%20installed-red) ![Latest](https://img.shields.io/badge/latest-brightgreen)`;
    }
    return '';
};

type ChangelogToMardkownOpts = {
    currentVersion?: string;
}
export const changelogToMarkdown = (changelog: Changelog, opts: ChangelogToMardkownOpts = {}): string => {
    const { currentVersion } = opts;
    const changelogVersions = changelog.versions.sort((a, b) => semver.rcompare(a.version, b.version));
    const latestVersion = changelogVersions[0]?.version;
    return `# DF Downloader Changelog\n\n${changelogVersions.map(version => {
    let versionHeader = `## ${version.version} (${version.date})`;
    if (currentVersion) {
        versionHeader += ` ${getVersionBadge(version.version, currentVersion, latestVersion)}`;
    }
    let result = `${versionHeader}\n\n`;
    if (version.notes) {
        result += `${version.notes}\n\n`;
    }
    result += Object.entries(version.changes || {}).reduce((acc: string[], [key, value]) => {
        acc.push(`### ${changeEntryNameMap[key as ChangeEntriesType]}\n`);
        acc.push(...value.reduce((acc: string[], change) => {
            acc.push(changeEntryToMarkdown(change, 0));
            return acc;
        }, []));
        return acc;
    }, []).join('');
    if (version.known_issues) {
        result += `### Known Issues\n`;
        result += version.known_issues.reduce((acc: string[], change) => {
            acc.push(changeEntryToMarkdown(change, 0));
            return acc;
        }, []).join('');
    }
    return result;
}).join('\n')}`;
}