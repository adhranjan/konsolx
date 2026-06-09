import { Router } from "express";
import { listWorkspaces, saveWorkspace, deleteWorkspace, openWorkspace } from "../services/workspaces.js";

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

router.post("/workspaces/:id/open", (req, res) => {
  try {
    const terminals = openWorkspace(req.params.id);
    res.json(terminals);
  } catch (err: any) {
    const status = err.message === "Workspace not found" ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.delete("/workspaces/:id", (req, res) => {
  deleteWorkspace(req.params.id);
  res.json({ success: true });
});

export default router;
