import { Router } from "express";
import { getConfig } from "../services/config.js";

const router = Router();

router.get("/config", (req, res) => {
  res.json(getConfig());
});

export default router;
