import { z } from 'zod';

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
    version: z.string(),
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

export const changelogToMarkdown = (changelog: Changelog): string => `# DF Downloader Changelog\n\n${changelog.versions.map(version => {
    let result = `## ${version.version} (${version.date})\n\n`;
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