import { Router } from "express";
import { exportAll, importAll } from "../services/bulk.js";

const router = Router();

router.get("/bulk/export", (req, res) => {
  res.json(exportAll());
});

router.post("/bulk/import", (req, res) => {
  try {
    const result = importAll(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
