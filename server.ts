import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import os from "os";
import path from "path";
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
  CREATE TABLE IF NOT EXISTS quick_commands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    cwd TEXT,
    envId TEXT,
    icon TEXT
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

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config", (req, res) => {
    res.json({ 
      useHostShell: process.env.USE_HOST_SHELL === "true",
      platform: os.platform()
    });
  });

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

  app.get("/api/quick-commands", (req, res) => {
    const rows = db.prepare("SELECT * FROM quick_commands").all();
    res.json(rows);
  });

  app.post("/api/quick-commands", (req, res) => {
    try {
      const { id, name, command, cwd, envId, icon } = req.body;
      const cmdId = id || Math.random().toString(36).substr(2, 9);
      
      db.prepare("INSERT OR REPLACE INTO quick_commands (id, name, command, cwd, envId, icon) VALUES (?, ?, ?, ?, ?, ?)").run(
        cmdId, 
        name || 'Untitled Command', 
        command || '',
        cwd || null,
        envId || null,
        icon || null
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Error saving quick command:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/quick-commands/:id", (req, res) => {
    db.prepare("DELETE FROM quick_commands WHERE id = ?").run(req.params.id);
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
    let shellProcess: ChildProcessWithoutNullStreams | null = null;

    ws.on("message", (message: string) => {
      const data = JSON.parse(message.toString());

      if (data.type === "init") {
        const { cwd, env, shell: customShell, cols, rows } = data;
        let selectedShell = customShell || shell;
        
        const startShell = (shellToTry: string) => {
          try {
            const isWindows = os.platform() === "win32";
            const useHostShell = process.env.USE_HOST_SHELL === "true";
            let finalShell = shellToTry;
            let finalArgs = [...shellArgs];

            // Use python3 pty trick to get a real terminal if on Unix
            // This fixes "Inappropriate ioctl for device" and provides a better prompt
            if (!isWindows) {
              if (useHostShell) {
                // Use nsenter to enter host namespaces
                // We need to be root and have --privileged or CAP_SYS_ADMIN
                finalShell = "nsenter";
                const pythonCode = `import pty, signal; signal.signal(signal.SIGINT, signal.SIG_IGN); pty.spawn("${shellToTry}")`;
                
                // -t 1: target PID 1 (host init)
                // -m: mount namespace (host filesystem)
                // -u: UTS namespace (host hostname)
                // -i: IPC namespace
                // -n: network namespace (host network)
                // -p: PID namespace (see host processes)
                finalArgs = ["-t", "1", "-m", "-u", "-i", "-n", "-p"];
                
                // Use sh to provide a fallback if python3 is not available or fails on the host
                // We do the 'cd' inside the shell command instead of using nsenter --wd
                // to avoid compatibility issues with older nsenter versions.
                const cdCommand = (cwd && path.isAbsolute(cwd)) ? `cd "${cwd}" 2>/dev/null || cd /; ` : "cd /; ";
                const wrappedCommand = `export KONSOLX_HOST=true; ${cdCommand}if command -v python3 >/dev/null 2>&1; then python3 -c '${pythonCode}' 2>/dev/null || exec ${shellToTry} -i; else exec ${shellToTry} -i; fi`;
                finalArgs.push("sh", "-c", wrappedCommand);
              } else {
                finalShell = "python3";
                // Use a robust one-liner that ignores SIGINT in the wrapper itself
                // so we don't get tracebacks, but the signal still reaches the child shell.
                const pythonCode = `import pty, signal; signal.signal(signal.SIGINT, signal.SIG_IGN); pty.spawn("${shellToTry}")`;
                finalArgs = ["-c", pythonCode];
              }
            }

            console.log(`Spawning: ${finalShell} ${finalArgs.join(' ')}`);
            console.log(`CWD: ${useHostShell ? 'Host' : (cwd || process.cwd())}`);

            // When using host shell, we want a clean environment to avoid container variables 
            // (like PYTHONPATH or LD_LIBRARY_PATH) interfering with host binaries.
            let spawnEnv: any = { ...process.env, ...env };
            
            if (useHostShell) {
              // Remove container-specific variables that interfere with host binaries
              delete spawnEnv.PYTHONPATH;
              delete spawnEnv.PYTHONHOME;
              delete spawnEnv.LD_LIBRARY_PATH;
              delete spawnEnv.NODE_ENV;
              
              spawnEnv.TERM = "xterm-256color";
              spawnEnv.PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
              spawnEnv.LANG = "en_US.UTF-8";
              spawnEnv.HOME = "/root";
              spawnEnv.KONSOLX_HOST = "true";
            } else {
              spawnEnv.TERM = "xterm-256color";
              spawnEnv.COLORTERM = "truecolor";
            }
            
            spawnEnv.COLUMNS = String(cols || 80);
            spawnEnv.LINES = String(rows || 24);

            shellProcess = spawn(finalShell, finalArgs, {
              cwd: useHostShell ? "/" : (cwd || process.cwd()),
              env: spawnEnv,
              detached: true,
            });

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

            if (useHostShell) {
              let msg = "\x1b[1;32m[Connected to Host Shell]\x1b[0m\r\n";
              msg += "\x1b[0;90m[Tip: On Docker Desktop, host files are typically at /mnt/host or /host_mnt]\x1b[0m\r\n";
              ws.send(JSON.stringify({ type: "output", data: msg }));
            }

            shellProcess.stdout.on("data", (data) => {
              ws.send(JSON.stringify({ type: "output", data: data.toString() }));
            });

            shellProcess.stderr.on("data", (data) => {
              ws.send(JSON.stringify({ type: "output", data: data.toString() }));
            });

            shellProcess.on("exit", (code, signal) => {
              console.log(`Shell process exited with code ${code} and signal ${signal}`);
              if (code !== 0 && code !== null) {
                let errorMsg = `\r\n[Process exited with code ${code}]\r\n`;
                if (code === 127) errorMsg += "[Error: Command not found. Ensure bash/python3 are installed on the host and nsenter can find them.]\r\n";
                if (code === 126) errorMsg += "[Error: Permission denied or command not executable. Check host security settings like AppArmor/SELinux.]\r\n";
                ws.send(JSON.stringify({ type: "output", data: errorMsg }));
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
        if (data.data === "\x03") { // Ctrl+C
          try {
            process.kill(-shellProcess.pid, 'SIGINT');
          } catch (e) {
            shellProcess.stdin.write(data.data);
          }
        } else if (data.data === "\x1a") { // Ctrl+Z
          try {
            process.kill(-shellProcess.pid, 'SIGTSTP');
          } catch (e) {
            shellProcess.stdin.write(data.data);
          }
        } else if (data.data === "\x1c") { // Ctrl+\
          try {
            process.kill(-shellProcess.pid, 'SIGQUIT');
          } catch (e) {
            shellProcess.stdin.write(data.data);
          }
        } else {
          shellProcess.stdin.write(data.data);
        }
      } else if (data.type === "resize" && shellProcess) {
        // We can't easily resize a non-pty process, but we can update env for future processes
        // or some shells might pick up SIGWINCH if we could send it (but we can't easily without pty)
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
