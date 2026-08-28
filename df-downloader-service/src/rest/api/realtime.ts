import { QueueStatusResponse } from "df-downloader-common";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { dfRequestQueueBusy, dfRequestQueueEvents, getDfRequestQueueStatus } from "../../df-request-queue.js";
import { StreamBroadcaster, StreamChannel } from "../realtime/stream-broadcaster.js";
import { makeBuildTasksResponse } from "./tasks-response.js";

/**
 * The single realtime stream, carrying every push channel as a named SSE event.
 *
 * Adding a channel here is all that's needed on the server side - clients pick
 * it up with addEventListener(name, ...) and no new connection, auth path or
 * reconnect handling is involved.
 */
export const makeRealtimeRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();
  const taskManager = contentManager.taskManager;
  const buildTasksResponse = makeBuildTasksResponse(contentManager);

  const channels: StreamChannel[] = [
    {
      name: "tasks",
      build: buildTasksResponse,
      subscribe: (onChange) => {
        taskManager.events.on("changed", onChange);
        return () => taskManager.events.off("changed", onChange);
      },
      // Download byte progress is pull-only, so a running pipeline has to be
      // sampled - no event fires as bytes arrive.
      hasActiveWork: () => taskManager.hasActiveWork(),
    },
    {
      name: "queue-status",
      build: (): QueueStatusResponse => ({
        dfQueue: getDfRequestQueueStatus(),
        scanInProgress: contentManager.scanInProgress,
        newContentCheckInProgress: contentManager.newContentCheckRunning,
        signedInToDf: contentManager.signedInToDf,
      }),
      // The queue pushes its own changes now, so transitions arrive
      // immediately instead of on the next sample - which is what made a
      // request that skipped the spacing gate observable at all, since one
      // could previously start and finish entirely between two 1s samples.
      subscribe: (onChange) => {
        dfRequestQueueEvents.on("changed", onChange);
        return () => dfRequestQueueEvents.off("changed", onChange);
      },
      // Sampling stays on as a safety net for the parts of this snapshot the
      // queue can't announce: scanInProgress/newContentCheckInProgress/
      // signedInToDf are getters derived from mutable state with no single
      // mutation point, so there's nothing to subscribe to without scattering
      // emits across the content manager and risking a permanently stale flag
      // when one is missed. Narrowed from the previous unconditional `true`
      // to "something is actually happening": while a scan or check runs, and
      // while any request is tracked - which, thanks to the post-completion
      // linger, extends a few seconds past the last request and so covers
      // sign-in state, which flips just after the DF request that determined
      // it has already finished. Fully idle now samples nothing at all.
      hasActiveWork: () =>
        dfRequestQueueBusy() || contentManager.scanInProgress || contentManager.newContentCheckRunning,
    },
  ];

  const broadcaster = new StreamBroadcaster(channels);
  router.get("/", (req: Request, res: Response) => broadcaster.addClient(req, res));
  return router;
};
