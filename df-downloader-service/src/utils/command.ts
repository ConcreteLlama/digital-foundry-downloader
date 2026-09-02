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
  /**
   * Abort to stop the process.
   *
   * These tools run for minutes - a transcription of a feature-length video
   * can run for an hour - so without this there is no way to take one back
   * once it has started, and the queue behind it is stuck until it finishes
   * on its own.
   */
  signal?: AbortSignal;
};

/**
 * Thrown when a command was deliberately stopped, rather than failing.
 *
 * Distinguished so callers can tell "the user pressed stop" from "the tool
 * broke". They want opposite handling: one is a normal outcome that should
 * clean up quietly, the other is an error worth reporting and retrying.
 */
export class CommandCancelledError extends Error {
  constructor(command: string) {
    super(`${command} was stopped`);
    this.name = "CommandCancelledError";
  }
}

/** How long a process gets to exit after being asked, before it is killed outright. */
const KILL_GRACE_MS = 5000;

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
/**
 * What these signals nearly always mean here. The name alone tells you
 * nothing, and a process killed by a signal never gets to explain itself.
 */
const SIGNAL_HINTS: Partial<Record<NodeJS.Signals, string>> = {
  SIGKILL: "typically the out-of-memory killer or a container memory limit",
  // Seen for real: whisper.cpp built with -march=native on one machine and
  // run on a less capable one. Nothing about the crash points at the CPU.
  SIGILL: "usually a binary compiled for a different CPU than the one running it",
  SIGSEGV: "a crash inside the tool itself",
};

export const describeExit = (command: string, code: number | null, signal: NodeJS.Signals | null) => {
  if (signal) {
    const hint = SIGNAL_HINTS[signal];
    return `${command} was killed by ${signal}${hint ? ` - ${hint}` : ""}`;
  }
  return `${command} exited with code ${code}`;
};

export const runCommand = async (command: string, args: string[], input?: string, opts: RunCommandOpts = {}) => {
  let output = "";
  let stderr = "";
  if (opts.signal?.aborted) {
    // Nothing spawned yet, so there is nothing to tidy up - just do not start.
    throw new CommandCancelledError(command);
  }
  const proc = spawn(command, args);
  let cancelled = false;
  let killTimer: NodeJS.Timeout | undefined;
  const onAbort = () => {
    cancelled = true;
    /*
     * Asked politely, then killed.
     *
     * On Windows Node terminates the process outright whatever signal is
     * named, so the grace period only really does anything on Linux - which
     * is where this runs in the container, and where whisper.cpp gets to
     * close its files rather than leaving a half-written one behind.
     */
    proc.kill("SIGTERM");
    killTimer = setTimeout(() => proc.kill("SIGKILL"), KILL_GRACE_MS);
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  await new Promise<void>((res, rej) => {
    proc.once("close", (code, signal) => {
      clearTimeout(killTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (cancelled) {
        // A killed process reports a non-zero code or a signal, which would
        // otherwise be reported as a crash. It was not one.
        return rej(new CommandCancelledError(command));
      }
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
      clearTimeout(killTimer);
      opts.signal?.removeEventListener("abort", onAbort);
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