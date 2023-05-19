import express from "express";
import http from "http";
import https from "https";
import fs from "fs";
import { RestApiConfig } from "df-downloader-common/config/rest-config.js";
import { logger } from "df-downloader-common";

export const createExpressServer = (config: RestApiConfig) => {
  const app = express();

  if (config.http) {
    // Create an HTTP server
    const httpServer = http.createServer(app);
    httpServer.listen(config.http.port, () => {
      logger.log("info", `Server listening on port ${config.http!.port}`);
    });
  }

  if (config.https) {
    // Create an HTTPS server
    const httpsServerOptions: https.ServerOptions = {
      key: fs.readFileSync(config.https.keyPath!),
      cert: fs.readFileSync(config.https.certPath!),
      ca: fs.readFileSync(config.https.caPath!),
      requestCert: config.https.requestCert,
      rejectUnauthorized: config.https.rejectUnauthorized,
    };
    const httpsServer = https.createServer(httpsServerOptions, app);
    httpsServer.listen(config.https.port, () => {
      logger.log("info", `Server listening on port ${config.https!.port}`);
    });
  }

  return app;
};
