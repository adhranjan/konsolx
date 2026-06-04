import { Router } from "express";
import { listEnvironments, saveEnvironment, deleteEnvironment } from "../services/environments.js";

const router = Router();

router.get("/environments", (req, res) => {
  res.json(listEnvironments());
});

router.post("/environments", (req, res) => {
  try {
    saveEnvironment(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/environments/:id", (req, res) => {
  deleteEnvironment(req.params.id);
  res.json({ success: true });
});

export default router;
