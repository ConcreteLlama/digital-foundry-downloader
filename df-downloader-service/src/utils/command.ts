import { spawn } from "child_process";
import { logger } from "df-downloader-common";

export type RunCommandOpts = {
  /**
   * Called with each chunk of stdout as it arrives, rather than only once the
   * command finishes. Long-running tools (whisper.cpp, ffmpeg) emit progress
   * as they go, and without this there's no way to surface it - the output is
   * otherwise only readable after the process has already exited.
   */
  onStdout?: (chunk: string) => void;
  /** As onStdout, for stderr - which is where ffmpeg reports most things. */
  onStderr?: (chunk: string) => void;
};

export const runCommand = async (command: string, args: string[], input?: string, opts: RunCommandOpts = {}) => {
  let output = "";
  let lastErr: any;
  const process = spawn(command, args);
  await new Promise<void>((res, rej) => {
    process.once("close", (rc) => {
      if (rc !== 0) {
        logger.log("error", `Error running command:`, lastErr.toString());
        return rej(lastErr.toString());
      }
      res();
    });
    process.once("error", (err) => {
      logger.log("error", `Error running command:`, err);
      rej(err);
    });
    process.stdout.on("data", (chunk) => {
      output += chunk;
      opts.onStdout?.(chunk.toString());
    });
    process.stderr.on("data", (chunk) => {
      lastErr = chunk;
      opts.onStderr?.(chunk.toString());
    });
    input && process.stdin.write(input, "utf8", (err) => {
      if (err) {
        logger.log("error", `Error writing to stdin:`, err);
        rej(err);
      }
    });
    process.stdin.end();
  });
  return output;
}