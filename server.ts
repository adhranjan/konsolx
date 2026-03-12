import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";
import os from "os";
import Database from "better-sqlite3";

const db = new Database("terminal.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    basePath TEXT,
    directories TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    groupName TEXT,
    variables TEXT NOT NULL
  );
`);

// Check if basePath column exists, if not add it (for existing databases)
const tableInfo = db.prepare("PRAGMA table_info(workspaces)").all();
const hasBasePath = tableInfo.some((col: any) => col.name === 'basePath');
if (!hasBasePath) {
  console.log('Adding basePath column to workspaces table...');
  db.exec("ALTER TABLE workspaces ADD COLUMN basePath TEXT");
}

const envTableInfo = db.prepare("PRAGMA table_info(environments)").all();
const hasGroupName = envTableInfo.some((col: any) => col.name === 'groupName');
if (!hasGroupName) {
  console.log('Adding groupName column to environments table...');
  db.exec("ALTER TABLE environments ADD COLUMN groupName TEXT");
}

// Seed sample workspace (Removed as requested)
db.prepare("DELETE FROM workspaces WHERE id = 'sample-work'").run();

// Seed sample environments (Removed as requested)

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.get("/api/workspaces", (req, res) => {
    const rows = db.prepare("SELECT * FROM workspaces").all();
    res.json(rows.map((r: any) => ({ ...r, directories: JSON.parse(r.directories) })));
  });

  app.post("/api/workspaces", (req, res) => {
    console.log('POST /api/workspaces - body:', JSON.stringify(req.body));
    try {
      const { id, name, basePath, directories } = req.body;
      const workspaceId = id || Math.random().toString(36).substr(2, 9);
      const dirs = typeof directories === 'string' ? directories : JSON.stringify(directories || []);
      const bp = basePath ?? null;
      
      console.log('Saving workspace:', { workspaceId, name, bp, dirsLength: dirs.length });
      
      const result = db.prepare("INSERT OR REPLACE INTO workspaces (id, name, basePath, directories) VALUES (?, ?, ?, ?)").run(
        workspaceId, 
        name || 'Untitled Workspace', 
        bp, 
        dirs
      );
      
      console.log('Workspace saved successfully, changes:', result.changes);
      res.json({ success: true });
    } catch (err) {
      console.error('Error saving workspace:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/workspaces/:id", (req, res) => {
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/environments", (req, res) => {
    const rows = db.prepare("SELECT * FROM environments").all();
    res.json(rows.map((r: any) => ({ ...r, variables: JSON.parse(r.variables) })));
  });

  app.post("/api/environments", (req, res) => {
    try {
      const { id, name, groupName, variables } = req.body;
      const envId = id || Math.random().toString(36).substr(2, 9);
      const vars = typeof variables === 'string' ? variables : JSON.stringify(variables || []);
      
      db.prepare("INSERT OR REPLACE INTO environments (id, name, groupName, variables) VALUES (?, ?, ?, ?)").run(
        envId, 
        name || 'Untitled Environment', 
        groupName || null,
        vars
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Error saving environment:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/environments/:id", (req, res) => {
    db.prepare("DELETE FROM environments WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // WebSocket for Terminal
  const getShell = () => {
    if (os.platform() === "win32") return "cmd.exe";
    return "bash";
  };

  const shell = getShell();
  const shellArgs = os.platform() === "win32" ? [] : ["-i"];

  wss.on("connection", (ws: WebSocket) => {
    let shellProcess = null;

    ws.on("message", (message: string) => {
      const data = JSON.parse(message.toString());

      if (data.type === "init") {
        const { cwd, env, shell: customShell } = data;
        let selectedShell = customShell || shell;
        
        const startShell = (shellToTry: string) => {
          try {
            shellProcess = spawn(shellToTry, shellArgs, {
              cwd: cwd || process.cwd(),
              env: { ...process.env, ...env, TERM: "xterm-256color" },
              detached: true,
            });

            shellProcess.unref();

            shellProcess.on("error", (err: any) => {
              if (err.code === 'ENOENT' && shellToTry === 'bash') {
                console.warn("bash not found, falling back to sh");
                startShell('sh');
                return;
              }
              console.error("Failed to start shell process:", err);
              ws.send(JSON.stringify({ type: "output", data: `\r\n[Error: Failed to start shell process: ${err.message}]\r\n` }));
              ws.close();
            });

            shellProcess.stdout.on("data", (data) => {
              ws.send(JSON.stringify({ type: "output", data: data.toString() }));
            });

            shellProcess.stderr.on("data", (data) => {
              ws.send(JSON.stringify({ type: "output", data: data.toString() }));
            });

            shellProcess.on("exit", (code, signal) => {
              console.log(`Shell process exited with code ${code} and signal ${signal}`);
              if (code !== 0 && code !== null) {
                ws.send(JSON.stringify({ type: "output", data: `\r\n[Process exited with code ${code}]\r\n` }));
              }
              ws.close();
            });
          } catch (err: any) {
            console.error("Critical error spawning shell:", err);
            ws.send(JSON.stringify({ type: "output", data: `\r\n[Critical Error: ${err.message}]\r\n` }));
            ws.close();
          }
        };

        startShell(selectedShell);
      } else if (data.type === "input" && shellProcess) {
        shellProcess.stdin.write(data.data);
      }
    });

    ws.on("close", () => {
      if (shellProcess && shellProcess.pid) {
        try {
          // Kill the whole process group (negative PID kills the group)
          process.kill(-shellProcess.pid);
        } catch (e) {
          // Fallback if group kill fails
          shellProcess.kill();
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  const PORT = process.env.PORT || 8012;
  server.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
