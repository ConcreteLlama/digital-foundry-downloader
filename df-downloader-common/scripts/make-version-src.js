import fs from 'fs';
import path from 'path';

const dir = path.dirname(import.meta.dirname);
const projectRoot = path.resolve(dir, '..');

const getGitBranch = () => {
    if (process.env.GIT_BRANCH) {
        return process.env.GIT_BRANCH;
    }
    // In a normal checkout `.git` is a directory; in a git worktree it's a
    // file containing "gitdir: <path>" pointing at the real per-worktree git
    // dir. Reading it blindly as a directory made `npm run build` fail
    // outright in any worktree, which is exactly where a branch name is most
    // worth reporting.
    const gitPath = path.join(projectRoot, '.git');
    let gitDir = gitPath;
    if (fs.statSync(gitPath).isFile()) {
        const gitDirRef = fs.readFileSync(gitPath, 'utf8').trim().replace(/^gitdir:\s*/, '');
        gitDir = path.resolve(projectRoot, gitDirRef);
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const branch = head.replace('ref: refs/heads/', '');
    return branch;
}

const branch = getGitBranch();
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const rootVersion = rootPackageJson.version;
const versionTsString = `
export const dfDownloaderVersion = '${rootVersion}';
export const dfDownloaderBranch: string = '${branch}';
`
const versionFile = path.join(dir, 'src', 'df-downloader-version.ts');
console.log(`Updating version src: ${versionFile}`);
fs.writeFileSync(versionFile, versionTsString);

console.log(`Updated version src:\n\n${versionTsString}`)
