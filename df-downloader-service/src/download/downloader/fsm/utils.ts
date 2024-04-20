import {
  DownloadConnection,
  createDownloadConnectionWithRange,
} from "../../download-connection/download-connection.js";
import { DownloadConnectionOptions } from "../../download-connection/fsm/types.js";
import { DownloadContext } from "./download-context.js";

export const createConnections = async (
  numConnections: number,
  contentLength: number | undefined,
  context: DownloadContext
) => {
  const { options } = context;
  const { destination, headers: headersInit, resolveOptions } = options;
  context.log("info", `Creating ${numConnections} connections for content length ${contentLength}`);
  const headers = new Headers(headersInit);
  const downloadConnectionOptions: DownloadConnectionOptions = {
    url: context.downloadUrl.clone({
      ...(options.connectionResolveOpts || {}),
      resolveInitial: options.connectionResolveOpts?.resolvePerConnection || false,
    }),
    destination,
    label: options.label || "download",
    logger: options.logger,
    headers,
    createFileIfNotExists: false,
    resolverOpts: resolveOptions,
    range: null,
    retryOpts: options.connectionRetries,
  };
  if (numConnections === 1 || !contentLength) {
    context.log("info", `Creating single connection`);
    return [createDownloadConnectionWithRange(downloadConnectionOptions)];
  } else {
    const chunkSize = Math.ceil(contentLength / numConnections);
    const connections: DownloadConnection[] = [];
    for (let i = 0; i < numConnections; i++) {
      context.log("info", `Creating connection ${i + 1}`);
      const rangeStart = i * chunkSize;
      const rangeEnd = i === numConnections - 1 ? null : rangeStart + chunkSize - 1;
      connections.push(
        createDownloadConnectionWithRange({
          ...downloadConnectionOptions,
          headers,
          label: `${downloadConnectionOptions.label}-${i}`,
          range: {
            start: rangeStart,
            end: rangeEnd,
          },
        })
      );
    }
    return connections;
  }
};
