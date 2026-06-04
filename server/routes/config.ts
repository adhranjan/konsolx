import { Router } from "express";
import { getConfig } from "../services/config.js";

const router = Router();

router.get("/config", async (req, res) => {
  res.json(await getConfig());
});

export default router;
