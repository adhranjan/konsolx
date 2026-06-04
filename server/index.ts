import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

// Init DB (runs migrations + seeds on import)
import "./database/index.js";

// Routes
import configRouter        from "./routes/config.js";
import workspacesRouter    from "./routes/workspaces.js";
import environmentsRouter  from "./routes/environments.js";
import quickCommandsRouter from "./routes/quick-commands.js";
import terminalsRouter, { handleWebSocket } from "./routes/terminals.js";
import killPortRouter      from "./routes/kill-port.js";
import bulkRouter          from "./routes/bulk.js";

export async function startServer() {
  const app    = express();
  const server = createServer(app);
  const wss    = new WebSocketServer({ server });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  app.get("/api/health", (_, res) => res.json({ status: "ok" }));
  app.use("/api", configRouter);
  app.use("/api", workspacesRouter);
  app.use("/api", environmentsRouter);
  app.use("/api", quickCommandsRouter);
  app.use("/api", terminalsRouter);
  app.use("/api", killPortRouter);
  app.use("/api", bulkRouter);

  // WebSocket
  const HEARTBEAT_INTERVAL = 20_000;
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws: WebSocket, req) => {
    handleWebSocket(ws as any, req, wss);
  });

  // Static / Vite
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  const PORT = Number(process.env.PORT ?? 8012);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[konsolx] Server running on http://localhost:${PORT}`);
  });
}
