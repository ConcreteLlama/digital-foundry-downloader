import { spawn } from "child_process";
import { logger } from "df-downloader-common";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

/**
 * Which ffmpeg and ffprobe this service runs.
 *
 * Chosen at runtime rather than baked in, because the portable ffmpeg-static
 * build has no hardware encoders compiled into it. That is fine for tagging,
 * probing and audio work, and hopeless for the one job that has to keep pace
 * with a viewer: no browser plays HEVC, a large part of Digital Foundry's 4K
 * catalogue is HEVC, and re-encoding 4K in software does not hold realtime on
 * the low-power machines this typically runs on.
 *
 * Two ways to get a better one, deliberately:
 *
 * - The Docker image installs jellyfin-ffmpeg - a build made for this exact
 *   job, carrying the VAAPI and QSV encoders plus its own Intel drivers - and
 *   sets FFMPEG_BINARY and FFPROBE_BINARY to it.
 * - Anywhere else, setting those two selects a system build. With neither,
 *   the binaries installed from npm are used, so a plain `npm install`
 *   checkout works with nothing to set up, as the README promises.
 *
 * Deliberately not "whatever ffmpeg is on PATH" ahead of those. Silently
 * preferring an unknown build over the installed one would change behaviour
 * across an upgrade for a reason nobody could see, and the failures that
 * produces - a codec missing, a flag read differently - surface a long way
 * from the cause. PATH is only the last resort, when there is nothing else.
 */

/*
 * INTERNAL NOTE - unfinished business.
 *
 * ffmpeg-static and ffprobe-static are ordinary dependencies, so the image
 * ships roughly 136MB of binaries that it is configured never to run: about
 * half of what jellyfin-ffmpeg costs to add. Making them optional and letting
 * `npm prune` drop them would reclaim that.
 *
 * Not done yet because it is not only a package.json change. Once they can be
 * absent, the two imports above have to become a guarded runtime load - a
 * static import of a package that is not installed throws at startup and
 * takes the whole service with it - and that wants testing on a real image
 * rather than reasoning. Written up under Queued follow-ups in
 * docs/ROADMAP.md; deferred on purpose rather than forgotten.
 */

const fromEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

export const ffmpegPath = fromEnv("FFMPEG_BINARY") ?? ffmpegStatic ?? "ffmpeg";
export const ffprobePath = fromEnv("FFPROBE_BINARY") ?? ffprobeStatic?.path ?? "ffprobe";

const describeSource = (envName: string, bundled: string | null | undefined, chosen: string) => {
  if (fromEnv(envName)) {
    return `${envName} is set`;
  }
  return chosen === bundled ? "bundled with the app" : "found on PATH";
};

/**
 * Says which ffmpeg is actually running, at startup.
 *
 * Worth a line of its own because the alternatives are all inferences, and
 * bad ones. The transcode probe reports whether a hardware encoder was
 * compiled in and never says which binary answered; everything else ffmpeg
 * contributes to the log is a failure message. The GPU investigation was
 * drawn out by exactly this shape of problem - lines that read like proof of
 * what was running while the work happened somewhere else.
 *
 * Never throws and never blocks startup. A missing ffmpeg is reported here
 * and then left to fail wherever something needs it, which names the job as
 * well as the tool.
 */
export const logFfmpegChoice = async () => {
  const version = await new Promise<string | undefined>((resolve) => {
    const probe = spawn(ffmpegPath, ["-hide_banner", "-version"]);
    let out = "";
    probe.stdout?.on("data", (chunk) => (out += String(chunk)));
    probe.on("error", () => resolve(undefined));
    probe.on("close", () => resolve(out.split("\n")[0]?.trim() || undefined));
  });
  if (!version) {
    logger.log("warn", `No usable ffmpeg at ${ffmpegPath} - playback conversion and metadata work will fail`);
    return;
  }
  logger.log(
    "info",
    `Using ffmpeg at ${ffmpegPath} (${describeSource("FFMPEG_BINARY", ffmpegStatic, ffmpegPath)}): ${version}`
  );
};
