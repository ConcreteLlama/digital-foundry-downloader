import { QueueStatusResponse } from "df-downloader-common";
import express, { Request, Response } from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { getDfRequestQueueStatus } from "../../df-request-queue.js";
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
      // Deliberately always "active" rather than gated on the queue being
      // non-empty. df-request-queue.ts has no event emitter at all, and the
      // fields outside the queue itself (sign-in state, scan flags) can change
      // with the queue completely idle - gating on queue depth would let those
      // go stale exactly as they never did under the old 5s poll.
      //
      // This costs nothing on the wire: the payload is small and entirely
      // in-memory to build (no DB, no IO), and the broadcaster's per-channel
      // dedupe means an unchanged status is never actually sent. The queue's
      // countdowns are absolute timestamps the client renders locally, so a
      // waiting queue serializes identically every tick and stays silent too.
      // Net effect is push-like latency with less traffic than the 5s poll.
      hasActiveWork: () => true,
    },
  ];

  const broadcaster = new StreamBroadcaster(channels);
  router.get("/", (req: Request, res: Response) => broadcaster.addClient(req, res));
  return router;
};
