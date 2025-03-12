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
  ['df-downloader-common', 'df-downloader-service', 'df-downloader-ui'].forEach(file => {
    const fullPath = path.join(dir, file);
    const packageJsonPath = path.join(fullPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      updateVersion(packageJsonPath);
    } else {
      throw new Error(`No package.json found in ${fullPath}`);
    }
  });
};

updateAllVersions(projectRoot);

console.log(`Updated subdirectory package.json files to version ${rootVersion}`);