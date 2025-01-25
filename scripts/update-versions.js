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

// Find all package.json files in subdirectories and update their version
const updateAllVersions = (dir) => {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const packageJsonPath = path.join(fullPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        updateVersion(packageJsonPath);
      }
      updateAllVersions(fullPath);
    }
  });
  fs.writeFileSync(path.join(projectRoot, 'df-downloader-common', 'src', 'df-downloader-version.ts'), `export const dfDownloaderVersion = '${rootVersion}';\n`);
};

updateAllVersions(projectRoot);

console.log(`Updated subdirectory package.json files to version ${rootVersion}`);