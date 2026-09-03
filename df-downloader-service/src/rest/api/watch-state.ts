import { SetWatchStateRequest, WatchState, isWatchedPosition } from "df-downloader-common";
import express, { Request, Response } from "express";
import { serviceLocator } from "../../services/service-locator.js";
import { sendError, sendResponse, zodParseHttp } from "../utils/utils.js";

/**
 * What this app knows about what you have watched.
 *
 * Its own routes rather than part of the content API because watch state is
 * written on a completely different cadence to content - every ten seconds
 * while something plays - and read by list views that do not want a content
 * payload attached.
 */
export const makeWatchStateRouter = () => {
  const router = express.Router();

  /** Everything known, for list views drawing a watched marker per row. */
  router.get("/", async (_req: Request, res: Response) => {
    const store = serviceLocator.watchState;
    return sendResponse(res, { watchStates: store ? store.getAll() : [] });
  });

  /**
   * Pull from the media servers right now.
   *
   * Forced past the throttle: this is someone pressing a button and watching
   * for an answer, so "a sync ran recently" is not a useful reply. Returns
   * what each server recognised rather than just a count - a server matching
   * none of the files is the path-mapping symptom, and the number is the only
   * thing that says so.
   */
  router.post("/sync", async (_req: Request, res: Response) => {
    const sync = serviceLocator.watchStateSync;
    if (!sync) {
      return sendError(res, "Watch state sync is not available", 503);
    }
    try {
      return sendResponse(res, await sync.syncNow("requested", { force: true }));
    } catch (e: any) {
      return sendError(res, `Could not sync watched state: ${e?.message ?? e}`, 500);
    }
  });

  /**
   * One item's state.
   *
   * Also the moment a pull from the media servers is worth doing, since
   * opening something is exactly when a stale "unwatched" is visible. Started
   * rather than awaited: a pull reads a whole library back, and a dialog that
   * waits on two media servers before it can render is a worse outcome than
   * showing state that is one poll old. The pull is throttled, so opening
   * several things in a row is one read, not one per click.
   */
  router.get("/:contentKey", async (req: Request, res: Response) => {
    const store = serviceLocator.watchState;
    void serviceLocator.watchStateSync?.syncNow("content opened").catch(() => {});
    return sendResponse(res, { watchState: store?.get(req.params.contentKey) });
  });

  /**
   * Setting it by hand, from the content view.
   *
   * Writes outright rather than merging: "mark as unwatched" has to be able to
   * clear a flag the merge rule treats as sticky, or the button appears to do
   * nothing. Position is left where it was unless given, so unmarking
   * something does not also lose your place in it.
   */
  router.post("/:contentKey", async (req: Request, res: Response) => {
    const store = serviceLocator.watchState;
    if (!store) {
      return sendError(res, "Watch state is not available", 503);
    }
    const { contentKey } = req.params;
    await zodParseHttp(SetWatchStateRequest, req, res, async (body) => {
      const existing = store.get(contentKey);
      const positionSeconds = body.positionSeconds ?? existing?.positionSeconds ?? 0;
      const durationSeconds = body.durationSeconds ?? existing?.durationSeconds;
      const next: WatchState = {
        contentKey,
        watched: body.watched ?? existing?.watched ?? isWatchedPosition(positionSeconds, durationSeconds),
        positionSeconds,
        durationSeconds,
        updatedAt: new Date(),
        source: "local",
      };
      return sendResponse(res, { watchState: store.set(next) });
    });
  });

  return router;
};
