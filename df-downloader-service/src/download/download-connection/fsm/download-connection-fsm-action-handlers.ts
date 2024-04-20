import fs from "fs";
import { Readable, pipeline } from "stream";
import { ActionFunction, AsyncDispatchFn } from "../../../fsm/fsm.js";
import { ResolveUrlMode } from "../../download-url.js";
import { DownloadConnectionContext } from "./download-connection-context.js";
import { DownloadConnectionError } from "./download-connection-error.js";
import { DownloadConnectionActions, DownloadConnectionStates, RangeOpt } from "./types.js";
import { checkFile, makeStreamsFromResponse, startFetch } from "./utils.js";

type DownloadConnectionDispatchFn = AsyncDispatchFn<DownloadConnectionStates, DownloadConnectionActions>;

const startDownloadWithRange = async (
  context: DownloadConnectionContext,
  dispatch: DownloadConnectionDispatchFn,
  mode: ResolveUrlMode,
  range?: RangeOpt | null
) => {
  // Check file
  await checkFile(context.options.destination);

  // Resolve URL
  const resolvedUrl = await context.options.url.resolve(mode);
  if (!resolvedUrl) {
    throw new DownloadConnectionError({ message: "Failed to resolve URL", reason: "url_resolve_failed" });
  }

  // Fetch
  const response = await startFetch(resolvedUrl, context.options.headers, range);
  context.currentResponse = response;

  // Pipe response
  const { readableStream, writableStream } = makeStreamsFromResponse(response, context);

  handlePipelineWithDispatch(readableStream, writableStream, context, dispatch);
};

const handlePipelineWithDispatch = (
  readableStream: Readable,
  writableStream: fs.WriteStream,
  context: DownloadConnectionContext,
  dispatch: DownloadConnectionDispatchFn
) => {
  pipeline(readableStream, writableStream, (error) => {
    if (error) {
      context.log("info", "Error callback", error);
      dispatch(
        "failed",
        new DownloadConnectionError({
          message: "Stream error",
          reason: "stream_error",
          error,
        })
      );
    }
  })
    .on("error", (error) => {
      dispatch(
        "failed",
        new DownloadConnectionError({
          message: "Stream error",
          reason: "stream_error",
          error,
        })
      );
    })
    .on("finish", () => {
      context.log("info", "Got finish");
      dispatch("stream_finished");
    });
};

export const initialStartHandler: ActionFunction<
  DownloadConnectionStates,
  DownloadConnectionActions,
  DownloadConnectionContext,
  "initial_start"
> = ({ context, dispatch }) => {
  new Promise(async (resolve) => {
    try {
      await startDownloadWithRange(context, dispatch, "initial", context.options.range);
    } catch (e) {
      if (e instanceof DownloadConnectionError) {
        dispatch("failed", e);
      } else {
        dispatch("failed", new DownloadConnectionError({ message: "Unknown error", reason: "unknown", error: e }));
      }
    } finally {
      resolve("starting");
    }
  });
  return "downloading";
};

export const resumeHandler: ActionFunction<
  DownloadConnectionStates,
  DownloadConnectionActions,
  DownloadConnectionContext,
  "resume"
> = ({ context, dispatch, payload: resumeMode }) => {
  new Promise(async (resolve) => {
    try {
      const offset = context.totalProgress.bytesDownloaded;
      const { start, end } = context.options.range || { start: 0, end: null };
      const range = {
        start: start + offset,
        end: end,
      };
      await startDownloadWithRange(context, dispatch, resumeMode, range);
    } catch (e) {
      if (e instanceof DownloadConnectionError) {
        dispatch("failed", e);
      } else {
        dispatch("failed", new DownloadConnectionError({ message: "Unknown error", reason: "unknown", error: e }));
      }
    } finally {
      resolve("starting");
    }
  });
  return "downloading";
};

export const failedHandler: ActionFunction<
  DownloadConnectionStates,
  DownloadConnectionActions,
  DownloadConnectionContext,
  "failed"
> = ({ context, payload, dispatch }) => {
  const retry = context.retryContext.retry(() => {
    dispatch("retry", "resume");
  });
  if (retry) {
    return "awaiting_retry";
  } else {
    context.log("error", "Setting result to failed", payload);
    context.result = {
      status: "failed",
      details: payload,
    };
    return "failed";
  }
};

export const retryHandler: ActionFunction<
  DownloadConnectionStates,
  DownloadConnectionActions,
  DownloadConnectionContext,
  "retry"
> = ({ context, payload, dispatch }) => {
  if (payload === "restart") {
    context.totalProgress.reset();
    context.currentProgress.reset();
  } else {
    context.currentProgress.reset();
  }
  dispatch("resume", "retry");
  return "starting";
};
