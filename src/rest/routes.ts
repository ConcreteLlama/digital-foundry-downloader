import express, { Request, Response } from "express";
import { Config } from "../config/config.js";
import { DigitalFoundryContentManager, sanitizeContentName } from "../df-content-manager.js";
import { LogLevel } from "../logger.js";

export function makeRoutes(config: Config, contentManager: DigitalFoundryContentManager) {
  const logger = config.logger;
  const app = express();
  const publicDirectoryPath = "public";
  app.use(express.static(publicDirectoryPath));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/contentInfo", async (req: Request, res: Response) => {
    let contentName: string = req.body.contentName;
    if (!contentName) {
      return res.status(400).send({
        message: "Must supply content name",
      });
    }
    contentName = sanitizeContentName(contentName);
    const contentInfo = await contentManager.getMediaInfo(contentName);
    if (!contentInfo) {
      return res.status(404).send();
    }
    return res.send(contentInfo);
  });

  app.get("/downloadQueue", async (req: Request, res: Response) => {
    const pendingContent = contentManager.pendingContent;
    return res.send(Array.from(pendingContent.values()));
  });

  app.post("/addContent", async (req: Request, res: Response) => {
    let contentName: string = req.body.contentName;
    if (!contentName) {
      return res.status(400).send({
        message: "Must supply content name",
      });
    }
    contentName = sanitizeContentName(contentName);
    logger.log(LogLevel.INFO, `addContent ${req.body.contentName} - ${contentName}`);
    try {
      const contentInfo = await contentManager.getContent(contentName);
      return res.send(contentInfo);
    } catch (e) {
      return res.status(500).send(e);
    }
  });

  app.post("/updateSessionId", async (req: Request, res: Response) => {
    const sessionId = req.body.sessionId;
    if (!sessionId) {
      return res.status(400).send({
        message: "Session ID must be supplied",
      });
    }
    config.sessionId = sessionId;
    return res.send();
  });

  app.listen(config.httpPort);
}
