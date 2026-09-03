import { ContentMoveFileInfo, DfContentEntry, DfContentInfo, DfContentInfoUtils, MediaInfo } from "df-downloader-common";
import { makeFilenameWithTemplate } from "df-downloader-common/utils/filename-template-utils.js";
import path from "path";
import { configService } from "../config/config.js";
import { pathIsEqual, sanitizeFilePath } from "./file-utils.js";

export const makeFilePathWithTemplate = (content: DfContentInfo, mediaInfo: MediaInfo, template: string) => {
    const rawFilename = makeFilenameWithTemplate(content, mediaInfo, template);
    const sanitizedFilename = sanitizeFilePath(rawFilename).fullPath;
    const destination = path.join(configService.config.contentManagement.destinationDir, sanitizedFilename);
    return destination;
};

/**
 * Where a sidecar belongs once its video has moved.
 *
 * Always takes the video's name, because a sidecar only does its job while it
 * shares one - `Foo.mp4` beside `Foo.eng.srt`. These come from the download's
 * recorded subtitle paths, so they are known to belong to this video rather
 * than merely found nearby, which is what makes renaming them safe.
 *
 * The part after the name is preserved: `.eng.srt` has to survive, or a
 * player loses the language. Taken from the old name's own tail where it
 * shares the video's basename, and otherwise reconstructed from its extensions
 * - the case that matters for a library reorganized before sidecars were
 * handled, where the video was renamed and the .srt was left behind under the
 * previous title entirely.
 */
export const sidecarDestination = (oldVideo: string, newVideo: string, sidecar: string) => {
    const oldBase = path.basename(oldVideo, path.extname(oldVideo));
    const newBase = path.basename(newVideo, path.extname(newVideo));
    const sidecarName = path.basename(sidecar);
    if (sidecarName.startsWith(oldBase)) {
        return path.join(path.dirname(newVideo), `${newBase}${sidecarName.slice(oldBase.length)}`);
    }
    const ext = path.extname(sidecarName);
    const inner = path.extname(sidecarName.slice(0, -ext.length || undefined));
    // A short inner extension is a language tag (.eng, .en); a long one is
    // just part of a title that happened to contain a dot.
    const suffix = inner && inner.length <= 5 ? `${inner}${ext}` : ext;
    return path.join(path.dirname(newVideo), `${newBase}${suffix}`);
};

export const getFileMoveList = (contentEntires: DfContentEntry[], template: string) => contentEntires.reduce((acc, { contentInfo, downloads }) => {
    if (!downloads.length) {
        return acc;
    }
    const oldFilenames = new Set<string>();
    for (const download of downloads) {
        const mediaInfo = download.mediaInfo;
        const oldFilename = path.normalize(download.downloadLocation);
        if (oldFilenames.has(oldFilename)) {
            continue;
        }
        oldFilenames.add(oldFilename);
        const newFilename = path.normalize(makeFilePathWithTemplate(contentInfo, mediaInfo, template));
        /*
         * Subtitle sidecars that are not already beside where the video is
         * going. Only recorded paths are considered - DfContentSubtitleInfo
         * stores one only after confirming the file is really there, so these
         * are trustworthy in a way a derived path would not be.
         */
        const sidecars = (download.subtitles ?? [])
            .flatMap((subtitle) => (subtitle.path ? [path.normalize(subtitle.path)] : []))
            .map((oldSidecar) => ({
                oldFilename: oldSidecar,
                newFilename: path.normalize(sidecarDestination(oldFilename, newFilename, oldSidecar)),
            }))
            .filter((move) => !pathIsEqual(move.oldFilename, move.newFilename));
        if (!pathIsEqual(oldFilename, newFilename)) {
            acc.push({
                sidecars,
                // `key`, not `name` - the content-status DB (which is what the
                // move actually has to update) is keyed by `key`, and post
                // identity-split `name` is a cosmetic title slug that in general
                // matches nothing there. Passing `name` here meant every move
                // found no record to update: the file moved, the DB kept pointing
                // at the old path, and the task still reported success.
                contentName: contentInfo.key,
                oldFilename: oldFilename,
                newFilename: newFilename,
            });
        }
    };
    return acc;
}, [] as ContentMoveFileInfo[])
