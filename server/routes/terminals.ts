import { Router } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import {
  listTerminals,
  getTerminal,
  spawnTerminal,
  killTerminal,
  killAllTerminals,
  attachClient,
  detachClient,
  updateTerminalMeta,
  applyEnvToTerminal,
  patchTerminalVars,
} from "../services/terminals.js";
import { sessions } from "../sessions.js";

const router = Router();

router.get("/terminals", async (req, res) => {
  res.json(await listTerminals());
});

router.get("/terminals/:id", async (req, res) => {
  const terminal = await getTerminal(req.params.id);
  if (!terminal) return res.status(404).json({ error: "Session not found" });
  res.json(terminal);
});

router.post("/terminals", (req, res) => {
  try {
    const session = spawnTerminal(req.body);
    res.json({ sessionId: session.sessionId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put("/terminals/:id", (req, res) => {
  const updated = updateTerminalMeta(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Session not found" });
  res.json({ success: true });
});

router.patch("/terminals/:id/vars", (req, res) => {
  try {
    patchTerminalVars(req.params.id, req.body);
    res.json({ success: true });
  } catch (err: any) {
    const status = err.message === "Session not found" ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.put("/terminals/:id/env/:envId", async (req, res) => {
  try {
    await applyEnvToTerminal(req.params.id, req.params.envId);
    res.json({ success: true });
  } catch (err: any) {
    const status =
      err.message === "Session not found" || err.message === "Environment not found" ? 404 :
      err.message === "Terminal is busy" ? 409 :
      500;
    res.status(status).json({ error: err.message });
  }
});

router.delete("/terminals", async (_req, res) => {
  await killAllTerminals();
  res.json({ success: true });
});

router.delete("/terminals/:id", async (req, res) => {
  await killTerminal(req.params.id); // no-op if already gone
  res.json({ success: true });
});

// ── WebSocket handler ────────────────────────────────────────────────────────
export function handleWebSocket(ws: WebSocket & { isAlive?: boolean }, req: IncomingMessage) {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  let sessionId: string | null = null;

  ws.on("message", (raw: string) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === "attach") {
      sessionId = msg.sessionId;
      if (!attachClient(sessionId!, ws)) {
        ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
        ws.close();
      } else {
        ws.send(JSON.stringify({ type: "session", sessionId }));
      }

    } else if (msg.type === "input" && sessionId) {
      const session = sessions.get(sessionId);
      if (session?.shell.stdin.writable) session.shell.stdin.write(msg.data);

    } else if (msg.type === "resize" && sessionId) {
      // PTY resize — placeholder for node-pty migration
    }
  });

  ws.on("close", () => {
    if (sessionId) detachClient(sessionId, ws);
  });
}

export default router;
