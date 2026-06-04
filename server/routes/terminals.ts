import { Router } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import {
  listTerminals,
  getTerminal,
  spawnTerminal,
  killTerminal,
  attachClient,
  detachClient,
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

router.delete("/terminals/:id", async (req, res) => {
  const exists = sessions.has(req.params.id);
  if (!exists) return res.status(404).json({ error: "Session not found" });
  await killTerminal(req.params.id);
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

    } else if (msg.type === "init") {
      // Backward-compat: create + attach in one step
      try {
        const session = spawnTerminal(msg);
        sessionId = session.sessionId;
        attachClient(sessionId, ws);
        ws.send(JSON.stringify({ type: "session", sessionId }));
      } catch (err: any) {
        ws.send(JSON.stringify({ type: "output", data: `\r\n[Error: ${err.message}]\r\n` }));
        ws.close();
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
