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

/**
 * How much stderr to keep for a failure message. Enough to carry the actual
 * error, bounded because these tools are chatty and the text ends up in a
 * task's error field, which is persisted and rendered in the UI.
 */
const STDERR_TAIL_LIMIT = 4096;

/**
 * Describes how a process ended, in terms worth reading.
 *
 * A process killed by a signal reports a null exit code, and SIGKILL in
 * particular is nearly always the kernel's OOM killer or a container memory
 * limit rather than anything the tool did wrong. That's worth naming
 * explicitly: the tool gets no chance to say anything before it dies, so the
 * only evidence is whatever it had already printed - which reads like an
 * unrelated crash if the signal isn't reported alongside it.
 */
export const describeExit = (command: string, code: number | null, signal: NodeJS.Signals | null) => {
  if (signal) {
    return signal === "SIGKILL"
      ? `${command} was killed (SIGKILL) - typically the out-of-memory killer or a container memory limit`
      : `${command} was killed by ${signal}`;
  }
  return `${command} exited with code ${code}`;
};

export const runCommand = async (command: string, args: string[], input?: string, opts: RunCommandOpts = {}) => {
  let output = "";
  let stderr = "";
  const proc = spawn(command, args);
  await new Promise<void>((res, rej) => {
    proc.once("close", (code, signal) => {
      if (code === 0) {
        return res();
      }
      // The tail of stderr, rather than the last chunk of it. Chunk
      // boundaries are arbitrary, so keeping only the most recent chunk
      // could report a tool's startup banner as the "error" while the real
      // message sat in an earlier one - and it threw outright when a process
      // died having written nothing at all, replacing the failure with a
      // TypeError.
      const detail = stderr.trim();
      const message = `${describeExit(command, code, signal)}${detail ? `:
${detail}` : " without writing any output"}`;
      logger.log("error", `Error running command: ${message}`);
      rej(new Error(message));
    });
    proc.once("error", (err) => {
      logger.log("error", `Error running command:`, err);
      rej(err);
    });
    proc.stdout.on("data", (chunk) => {
      output += chunk;
      opts.onStdout?.(chunk.toString());
    });
    proc.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-STDERR_TAIL_LIMIT);
      opts.onStderr?.(chunk.toString());
    });
    input && proc.stdin.write(input, "utf8", (err) => {
      if (err) {
        logger.log("error", `Error writing to stdin:`, err);
        rej(err);
      }
    });
    proc.stdin.end();
  });
  return output;
}