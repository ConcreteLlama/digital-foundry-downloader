import express from "express";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import {
  DEFAULT_DIAGNOSTIC_PARTS,
  DIAGNOSTIC_PARTS,
  DiagnosticPart,
  writeDiagnosticBundle,
} from "../../utils/diagnostic-bundle.js";
import { getSystemInfo } from "../../utils/system-info.js";
import { sendError, sendResponse } from "../utils/utils.js";

export const makeSystemRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  /*
   * Authenticated, unlike /service-info.
   *
   * /service-info is deliberately open because the login page itself needs a
   * version to show. This is a different thing: paths, a library summary and
   * which integrations are configured are not secrets, but they are nobody's
   * business but the owner's.
   */
  router.get("/info", async (req, res) => sendResponse(res, await getSystemInfo(contentManager.db)));

  /*
   * A zip of the things a bug report always needs, streamed as it is built.
   *
   * A browser download rather than something fetchable by a third party: the
   * contents are redacted, but they are still an inventory of somebody's
   * machine, and there is no case for an endpoint that hands that to anyone
   * who can reach the API.
   */
  router.get("/report", async (req, res) => {
    const requested = String(req.query.parts ?? DEFAULT_DIAGNOSTIC_PARTS.join(","))
      .split(",")
      .map((part) => part.trim())
      .filter((part): part is DiagnosticPart => DIAGNOSTIC_PARTS.includes(part as DiagnosticPart));
    if (!requested.length) {
      return sendError(res, `Choose at least one of: ${DIAGNOSTIC_PARTS.join(", ")}`, 400);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="df-downloader-report-${stamp}.zip"`);
    try {
      await writeDiagnosticBundle(res, requested, contentManager.db);
    } catch (e) {
      // Headers are already out by the time anything here can fail, so the
      // only honest thing left is to end the stream - a truncated zip fails
      // loudly when opened, which beats a plausible-looking empty one.
      res.destroy(e instanceof Error ? e : new Error(String(e)));
    }
  });

  return router;
};
