import { Router } from "express";
import { listWorkspaces, saveWorkspace, deleteWorkspace } from "../services/workspaces.js";

const router = Router();

router.get("/workspaces", (req, res) => {
  res.json(listWorkspaces());
});

router.post("/workspaces", (req, res) => {
  try {
    saveWorkspace(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put("/workspaces/:id", (req, res) => {
  try {
    saveWorkspace({ ...req.body, id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/workspaces/:id", (req, res) => {
  deleteWorkspace(req.params.id);
  res.json({ success: true });
});

export default router;
