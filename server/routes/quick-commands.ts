import { Router } from "express";
import { listQuickCommands, saveQuickCommand, deleteQuickCommand } from "../services/quick-commands.js";

const router = Router();

router.get("/quick-commands", (req, res) => {
  res.json(listQuickCommands());
});

router.post("/quick-commands", (req, res) => {
  try {
    saveQuickCommand(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put("/quick-commands/:id", (req, res) => {
  try {
    saveQuickCommand({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/quick-commands/:id", (req, res) => {
  deleteQuickCommand(req.params.id);
  res.json({ success: true });
});

export default router;
