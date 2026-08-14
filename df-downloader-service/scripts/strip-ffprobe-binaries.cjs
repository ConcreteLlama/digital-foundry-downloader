const fs = require('fs');
const path = require('path');

// Resolve via Node's module resolution rather than a hardcoded
// node_modules/ffprobe-static path - under npm workspaces, ffprobe-static
// is hoisted to the repo root's node_modules rather than living locally
// inside df-downloader-service/node_modules.
const ffprobePackageJson = require.resolve('ffprobe-static/package.json');
const ffprobeBinDir = path.join(path.dirname(ffprobePackageJson), 'bin');
const os = require('os');
const platform = os.platform();
const arch = os.arch();

console.log(`Stripping ffprobe binaries from ${ffprobeBinDir} with os.platform()=${platform} and os.arch()=${arch}`);
for (const platformFile of fs.readdirSync(ffprobeBinDir)) {
    if (platformFile === platform) {
        const platformDir = path.join(ffprobeBinDir, platformFile);
        for (const archFile of fs.readdirSync(platformDir)) {
            if (archFile !== arch) {
                const dirName = path.join(platformDir, archFile);
                console.log(`Removing ${dirName}`);
                fs.rmSync(dirName, { recursive: true });
            }
        }
    }
    if (platformFile !== platform) {
        const dirName = path.join(ffprobeBinDir, platformFile);
        console.log(`Removing ${dirName}`);
        fs.rmSync(dirName, { recursive: true });
    }
}