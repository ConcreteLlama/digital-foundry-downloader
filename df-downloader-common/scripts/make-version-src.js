import fs from 'fs';
import path from 'path';

const dir = path.dirname(import.meta.dirname);
const projectRoot = path.resolve(dir, '..');

/**
 * Resolves the .git directory, or undefined when there isn't one.
 *
 * In a normal checkout `.git` is a directory; in a git worktree it's a file
 * containing "gitdir: <path>" pointing at the real per-worktree git dir.
 * Reading it blindly as a directory made `npm run build` fail outright in any
 * worktree, which is exactly where build identity is most worth reporting.
 */
const getGitDir = () => {
    const gitPath = path.join(projectRoot, '.git');
    if (!fs.existsSync(gitPath)) {
        return undefined;
    }
    if (!fs.statSync(gitPath).isFile()) {
        return gitPath;
    }
    const gitDirRef = fs.readFileSync(gitPath, 'utf8').trim().replace(/^gitdir:\s*/, '');
    return path.resolve(projectRoot, gitDirRef);
}

const getGitBranch = () => {
    if (process.env.GIT_BRANCH) {
        return process.env.GIT_BRANCH;
    }
    const gitDir = getGitDir();
    if (!gitDir) {
        return 'unknown';
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const branch = head.replace('ref: refs/heads/', '');
    return branch;
}

/**
 * The commit the build came from, short form.
 *
 * Worth the trouble because without it there is no way to look at a running
 * install and tell which code is in it - a version number only changes at a
 * release, so every build between two releases is indistinguishable. That has
 * already cost real time: a container was rebuilt, a fix appeared not to
 * work, and it took a while to establish the image simply predated it.
 *
 * The build context inside Docker has no .git, hence the env var, exactly as
 * for the branch.
 */
const getGitCommit = () => {
    if (process.env.GIT_COMMIT) {
        return process.env.GIT_COMMIT.slice(0, 12);
    }
    const gitDir = getGitDir();
    if (!gitDir) {
        return 'unknown';
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) {
        // Detached HEAD holds the sha itself.
        return head.slice(0, 12);
    }
    const refPath = path.join(gitDir, head.slice('ref: '.length));
    if (fs.existsSync(refPath)) {
        return fs.readFileSync(refPath, 'utf8').trim().slice(0, 12);
    }
    // Refs get packed once there are enough of them, at which point the loose
    // file above is gone and this is the only copy.
    const packed = path.join(gitDir, 'packed-refs');
    if (fs.existsSync(packed)) {
        const ref = head.slice('ref: '.length);
        const line = fs.readFileSync(packed, 'utf8').split('\n').find((l) => l.endsWith(` ${ref}`));
        if (line) {
            return line.split(' ')[0].slice(0, 12);
        }
    }
    return 'unknown';
}

const branch = getGitBranch();
const commit = getGitCommit();
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const rootVersion = rootPackageJson.version;
const versionTsString = `
export const dfDownloaderVersion = '${rootVersion}';
export const dfDownloaderBranch: string = '${branch}';
export const dfDownloaderCommit: string = '${commit}';
export const dfDownloaderBuiltAt: string = '${new Date().toISOString()}';
`
const versionFile = path.join(dir, 'src', 'df-downloader-version.ts');
console.log(`Updating version src: ${versionFile}`);
fs.writeFileSync(versionFile, versionTsString);

console.log(`Updated version src:\n\n${versionTsString}`)
