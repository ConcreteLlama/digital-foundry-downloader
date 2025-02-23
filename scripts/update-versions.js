const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname);
const projectRoot = path.resolve(dir, '..');
// Get the version from the root package.json
const rootPackageJson = require(path.join(projectRoot, 'package.json'));
const rootVersion = rootPackageJson.version;

// Function to update version in package.json
const updateVersion = (filePath) => {
  const packageJson = require(filePath);
  packageJson.version = rootVersion;
  fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n');
};
const head = fs.readFileSync(path.join(projectRoot, '.git', 'HEAD'), 'utf8').trim();
const branch = head.replace('ref: refs/heads/', '');

// Find all package.json files in subdirectories and update their version
const updateAllVersions = (dir) => {
  fs.readdirSync(dir).forEach(file => {
    if (file === 'node_modules' || file === '.git') {
      return;
    }
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const packageJsonPath = path.join(fullPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        updateVersion(packageJsonPath);
      }
      updateAllVersions(fullPath);
    }
  });
  const versionTsString = `
  export const dfDownloaderVersion = '${rootVersion}';
  export const dfDownloaderBranch = '${branch}';
`
  fs.writeFileSync(path.join(projectRoot, 'df-downloader-common', 'src', 'df-downloader-version.ts'), versionTsString);
};

updateAllVersions(projectRoot);

console.log(`Updated subdirectory package.json files to version ${rootVersion}`);