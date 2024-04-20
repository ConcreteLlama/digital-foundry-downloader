import { promises as fsPromises } from "fs";
import { DownloadUrlOpt, UrlResolverOpts } from "./download-url.js";

export const parseRangeHeader = (rangeHeader: string) => {
  const result = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);
  const [rangeStart, rangeEnd] = result?.slice(1).map((n) => parseInt(n, 10)) || [0, 0];
  return {
    rangeStart,
    rangeEnd: isNaN(rangeEnd) ? undefined : rangeEnd,
  };
};

export const parseContentRangeHeader = (contentRangeHeader: string) => {
  const result = /(\w+) (\d+)-(\d+)\/(\d+)/.exec(contentRangeHeader);
  const units = result?.[1];
  const [rangeStart, rangeEnd, totalSize] = result?.slice(2).map((n) => parseInt(n, 10)) || [0, 0, 0, 0];
  return {
    units,
    rangeStart,
    rangeEnd,
    totalSize,
  };
};

const fetchHeaders = async (url: string, headers: HeadersInit) => {
  const response = await fetch(url, {
    method: "HEAD",
    headers,
  });
  if (response.status === 405) {
    const getResponse = await fetch(url, {
      method: "GET",
      headers: {
        ...headers,
        Range: "bytes=0-1",
      },
    });
    return getResponse.headers;
  }
  return response.headers;
};

export const getResourceInfo = async (url: string, headers: HeadersInit = {}) => {
  const responseHeaders = await fetchHeaders(url, headers);
  const acceptRange = responseHeaders.get("Accept-Ranges") || null;
  const contentLength = responseHeaders.get("Content-Length") || null;
  const etag = responseHeaders.get("ETag") || null;
  return {
    acceptRange,
    contentLength: contentLength ? parseInt(contentLength) : undefined,
    etag,
  };
};

export const prepareFileForWriting = async (destination: string, clobber: boolean) => {
  const deleteFile = async () => {
    await fsPromises.unlink(destination);
    await fsPromises.writeFile(destination, "");
  };
  const checkFileWriteable = () => fsPromises.access(destination, fsPromises.constants.W_OK);

  if (clobber) {
    try {
      await deleteFile();
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        throw e;
      }
    }
    await fsPromises.writeFile(destination, "");
  } else {
    try {
      await checkFileWriteable();
    } catch {
      throw new Error("File not writeable");
    }
  }
};

export const makeRangeHeader = (min: number, max?: number | null) => {
  return `bytes=${min}-${max || ""}`;
};
