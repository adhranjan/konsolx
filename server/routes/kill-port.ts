import { Router } from "express";
import { killPort, NotFoundError } from "../services/kill-port.js";

const router = Router();

router.post("/kill-port", async (req, res) => {
  const { port } = req.body;
  if (!port || isNaN(Number(port))) {
    return res.status(400).json({ error: "Invalid port number" });
  }
  try {
    const result = await killPort(Number(port));
    res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
