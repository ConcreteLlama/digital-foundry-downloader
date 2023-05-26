import { logger } from "df-downloader-common";
import { RestApiConfig } from "df-downloader-common/config/rest-config.js";
import express from "express";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { configDir } from "../config/config.js";
import { generateSelfSignedCert, setupCert } from "./cert.js";

export const createExpressServer = async (config: RestApiConfig, publicAddress: string) => {
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
    let cert: string;
    let key: string;
    let ca: string | undefined;
    if (config.https.keyPath && config.https.certPath) {
      cert = fs.readFileSync(config.https.certPath).toString();
      key = fs.readFileSync(config.https.keyPath).toString();
      if (config.https.caPath) {
        ca = fs.readFileSync(config.https.caPath).toString();
      }
    } else {
      logger.log("warn", "HTTPS key and cert paths not provided, generating self-signed certificate");
      const certData = await setupCert(path.join(configDir, "security"), publicAddress);
      cert = certData.cert;
      key = certData.key;
    }
    const httpsServerOptions: https.ServerOptions = {
      key,
      cert,
      ca,
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
