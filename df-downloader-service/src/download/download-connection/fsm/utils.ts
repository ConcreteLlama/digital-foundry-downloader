import { makeRangeHeader, parseContentRangeHeader } from "../../utils.js";
import { DownloadConnectionError } from "./download-connection-error.js";
import fsPromises from "fs/promises";
import fs from "fs";
import { RangeOpt } from "./types.js";
import { DownloadConnectionContext } from "./download-connection-context.js";
import { Readable } from "stream";

export const checkFile = async (destination: string) => {
  try {
    await fsPromises.access(destination, fs.constants.F_OK);
    return true;
  } catch (e) {
    throw new DownloadConnectionError({
      message: "File is not writable",
      reason: "file_not_writable",
      error: e,
    });
  }
};

export const startFetch = async (url: string, headers: Headers, range?: RangeOpt | null) => {
  if (range) {
    headers.set("Range", makeRangeHeader(range.start, range.end));
  }
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) {
    throw new DownloadConnectionError({
      message: "Fetch failed",
      reason: "bad_fetch_response",
      response,
      error: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    });
  }
  return response;
};

export const makeStreamsFromResponse = (response: Response, context: DownloadConnectionContext) => {
  context.currentResponse = response;
  const body = response.body;
  if (!body) {
    throw new DownloadConnectionError({
      message: "missing content body",
      reason: "bad_fetch_response",
      error: "missing content body",
    });
  }
  const contentLengthHeader = response.headers.get("Content-Length");
  if (!contentLengthHeader) {
    throw new DownloadConnectionError({
      message: "missing content length header",
      reason: "bad_fetch_response",
      error: "missing content length header",
    });
  }
  const acceptRanges = response.headers.get("Accept-Ranges");
  const contentRange = response.headers.get("Content-Range");
  for (const header of response.headers) {
    context.log("info", `Header: ${header}`);
  }
  context.capabilities.supportsByteRangeHeaders =
    Boolean(acceptRanges?.includes("bytes")) || Boolean(contentRange?.includes("bytes"));
  context.log("info", `Setting capabilities`, context.capabilities);
  let offset = 0;
  const contentLength = parseInt(contentLengthHeader, 10);
  context.currentProgress.reset(contentLength);

  const contentRangeHeader = response.headers.get("Content-Range");
  if (contentRangeHeader) {
    const { rangeStart, rangeEnd, totalSize } = parseContentRangeHeader(contentRangeHeader);
    context.totalFileSize = totalSize;
    offset = rangeStart;
    if (!context.isProgressMade()) {
      context.log("info", "no progress made, resetting total progress");
      context.totalProgress.reset(contentLength);
    }
  } else if (!context.isProgressMade() || !context.capabilities.supportsByteRangeHeaders) {
    context.log(
      "info",
      "no content range header, resetting",
      context.isProgressMade(),
      context.capabilities.supportsByteRangeHeaders
    );

    context.totalProgress.reset(contentLength);
    context.totalFileSize = contentLength;
  }
  const reader = body.getReader();
  let lastPercent = 0;

  const readableStream = new Readable({
    async read(size) {
      try {
        const result = await reader.read();
        if (result.done) {
          this.push(null);
        } else {
          context.updateProgress(result.value.length);
          const newPercent = (context.totalProgress.bytesDownloaded / context.totalProgress.totalBytes!) * 100;

          if (newPercent >= lastPercent + 1) {
            lastPercent = newPercent;
          }
          this.push(result.value);
        }
      } catch (e: any) {
        if (e.name === "AbortError") {
          context.log("info", "Aborted");
          this.push(null);
        } else {
          context.log("info", "Error in readable", e);
          this.emit("error", e);
        }
      }
    },
  });
  context.currentReader = reader;
  return {
    readableStream,
    writableStream: fs.createWriteStream(context.options.destination, {
      start: offset,
      flags: "r+",
    }),
  };
};
