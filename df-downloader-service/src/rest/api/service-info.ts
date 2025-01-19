import express from "express";
import { sendResponse } from "../utils/utils.js";
import { serviceInfo } from "../../utils/service.js";

export const makeServiceInfoRouter = () => {
  const router = express.Router();
  router.get("/", async (req, res) => {
    return sendResponse(res, serviceInfo);
  });
  return router;
};
