const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname);
const projectRoot = path.resolve(dir, '..');

const ffprobeBinDir = path.join(projectRoot, 'node_modules', 'ffprobe-static', 'bin');
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