import fs from 'fs';
import path from 'path';

const dir = path.dirname(import.meta.dirname);
const projectRoot = path.resolve(dir, '..');

const getGitBranch = () => {
    if (process.env.GIT_BRANCH) {
        return process.env.GIT_BRANCH;
    }
    const head = fs.readFileSync(path.join(projectRoot, '.git', 'HEAD'), 'utf8').trim();
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
