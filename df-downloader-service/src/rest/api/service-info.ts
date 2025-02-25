import express from "express";
import { sendResponse } from "../utils/utils.js";
import { serviceInfo } from "../../utils/service.js";
import fs from "fs/promises";

export const makeServiceInfoRouter = () => {
  const router = express.Router();
  router.get("/", async (req, res) => {
    return sendResponse(res, serviceInfo);
  });
  router.get("/changelog", async (req, res) => {
    const changelog = await fs.readFile("./changelog.yaml", "utf-8");
    return res.status(200).send(changelog);
  });
  return router;
};
