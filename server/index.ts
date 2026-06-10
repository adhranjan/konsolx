import express from "express";
import { killAllTerminals } from "./services/terminals.js";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dev (tsx): __dirname = <project>/server  → go up 1
// In prod (compiled): __dirname = <project>/build/server → go up 2
// Resolve to wherever package.json lives by walking up until we find it
function findRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, "package.json"))) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return dir; // filesystem root fallback
  return findRoot(parent);
}
const ROOT = findRoot(__dirname);

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
    handleWebSocket(ws as any, req);
  });

  // Static / Vite
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    // Dynamic import — vite is a devDependency, not available in packaged app
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: ROOT,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT, "dist");
    app.use(express.static(distDir));
    // SPA fallback — serve index.html for all non-API routes
    app.get("*", (_, res) => res.sendFile(path.join(distDir, "index.html")));
  }

  const PORT = Number(process.env.KONSOLX_PORT ?? process.env.PORT ?? 8016);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[konsolx] Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown — kill all terminal sessions before exiting
  const shutdown = async (signal: string) => {
    console.log(`[konsolx] ${signal} received — killing all sessions...`);
    await killAllTerminals();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000); // force exit if close hangs
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}
