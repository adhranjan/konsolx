import { Router } from "express";
import { getConfig } from "../services/config.js";
import { settingsDb } from "../database/settings.js";

const router = Router();

router.get("/config", (req, res) => {
  res.json(getConfig());
});

// ── Settings (key/value) ──────────────────────────────────────────────────────
router.get("/settings", (req, res) => {
  res.json(settingsDb.all());
});

router.put("/settings/:key", (req, res) => {
  const value = req.body?.value;
  if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });
  settingsDb.set(req.params.key, value);
  res.json({ success: true });
});

export default router;
