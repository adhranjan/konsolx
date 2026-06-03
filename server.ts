import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

const dataDir = process.env.DATA_DIR || ".";
const db = new Database(`${dataDir}/terminal.db`);

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
    icon TEXT,
    grp TEXT
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

const qcTableInfo = db.prepare("PRAGMA table_info(quick_commands)").all();
const hasQcGrp = qcTableInfo.some((col: any) => col.name === 'grp');
if (!hasQcGrp) {
  console.log('Adding grp column to quick_commands table...');
  db.exec("ALTER TABLE quick_commands ADD COLUMN grp TEXT");
}

// Seed sample workspace (Removed as requested)
db.prepare("DELETE FROM workspaces WHERE id = 'sample-work'").run();

// Seed built-in "Konsolx Update" quick command (once, never overwrite if user edits it)
const hostUser = process.env.HOST_USER;
const updateCwd = hostUser ? `/home/${hostUser}` : '';
const existing = db.prepare("SELECT id FROM quick_commands WHERE id = 'konsolx-update'").get();
if (!existing) {
  db.prepare("INSERT INTO quick_commands (id, name, command, cwd, grp) VALUES (?, ?, ?, ?, ?)").run(
    'konsolx-update',
    'Konsolx Update',
    'docker compose pull && HOST_USER=$(whoami) docker compose up -d',
    updateCwd || null,
    'Konsolx'
  );
}

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
    const rows = db.prepare("SELECT * FROM quick_commands").all() as any[];
    res.json(rows.map(r => ({ ...r, group: r.grp || undefined })));
  });

  app.post("/api/quick-commands", (req, res) => {
    try {
      const { id, name, command, cwd, envId, icon, group } = req.body;
      const cmdId = id || Math.random().toString(36).substr(2, 9);

      db.prepare("INSERT OR REPLACE INTO quick_commands (id, name, command, cwd, envId, icon, grp) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        cmdId,
        name || 'Untitled Command',
        command || '',
        cwd || null,
        envId || null,
        icon || null,
        group || null
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

  // Kill port API
  app.post("/api/kill-port", async (req, res) => {
    const { port } = req.body;
    if (!port || isNaN(Number(port))) {
      return res.status(400).json({ error: "Invalid port number" });
    }

    const platform = os.platform();

    try {
      if (platform === "win32") {
        // Windows: find PID via netstat, then taskkill
        const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
          const proc = spawn("netstat", ["-ano"]);
          let out = "";
          proc.stdout.on("data", (d) => out += d.toString());
          proc.on("close", () => resolve({ stdout: out }));
          proc.on("error", reject);
        });
        const pids = [...new Set(
          stdout.split("\n")
            .filter(line => line.includes(`:${port} `) || line.includes(`:${port}\t`))
            .map(line => line.trim().split(/\s+/).pop())
            .filter(Boolean)
        )];
        if (pids.length === 0) return res.status(404).json({ error: `Nothing found on port ${port}` });
        for (const pid of pids) {
          await new Promise((resolve) => {
            const proc = spawn("taskkill", ["/PID", pid!, "/F"]);
            proc.on("close", resolve);
          });
        }
        res.json({ success: true, message: `Killed PIDs ${pids.join(", ")} on port ${port}` });
      } else {
        // Linux/Mac: find PIDs via lsof then kill -9
        // When USE_HOST_SHELL is true (Docker), use nsenter to reach host namespaces
        const useHostShell = process.env.USE_HOST_SHELL === "true";
        const shellCmd = `lsof -t -i :${port} 2>/dev/null`;

        // First: find PIDs
        const { stdout, code } = await new Promise<{ stdout: string; code: number }>((resolve) => {
          const args = useHostShell
            ? ["-t", "1", "-m", "-n", "-p", "--", "sh", "-c", shellCmd]
            : ["-c", shellCmd];
          const proc = spawn(useHostShell ? "nsenter" : "sh", args);
          let out = "";
          proc.stdout.on("data", (d) => out += d.toString());
          proc.on("close", (c) => resolve({ stdout: out, code: c ?? 1 }));
          proc.on("error", () => resolve({ stdout: "", code: 1 }));
        });

        const pids = stdout.trim().split("\n").filter(Boolean);
        if (pids.length === 0) return res.status(404).json({ error: `Nothing found on port ${port}` });

        // Kill all found PIDs
        const killCmd = `kill -9 ${pids.join(" ")} 2>/dev/null; true`;
        await new Promise<void>((resolve) => {
          const args = useHostShell
            ? ["-t", "1", "-m", "-n", "-p", "--", "sh", "-c", killCmd]
            : ["-c", killCmd];
          const proc = spawn(useHostShell ? "nsenter" : "sh", args);
          proc.on("close", resolve);
          proc.on("error", () => resolve());
        });

        res.json({ success: true, message: `Killed PIDs ${pids.join(", ")} on port ${port}` });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // WebSocket for Terminal
  const getShell = () => {
    if (os.platform() === "win32") return "cmd.exe";
    return "bash";
  };

  const shell = getShell();
  const shellArgs = os.platform() === "win32" ? [] : ["-i"];

  // session ID → shell PID, for busy detection
  const sessionShells = new Map<string, number>();

  // Get direct child PIDs of a process
  const getChildPids = (pid: number): Promise<number[]> =>
    new Promise((resolve) => {
      const proc = spawn("ps", ["-o", "pid=", "--ppid", String(pid)]);
      let out = "";
      proc.stdout.on("data", (d) => out += d.toString());
      proc.on("close", () => resolve(out.trim().split("\n").filter(Boolean).map(Number)));
      proc.on("error", () => resolve([]));
    });

  // Get comm (process name) for a PID
  const getComm = (pid: number): Promise<string> =>
    new Promise((resolve) => {
      const proc = spawn("ps", ["-o", "comm=", "-p", String(pid)]);
      let out = "";
      proc.stdout.on("data", (d) => out += d.toString());
      proc.on("close", () => resolve(out.trim()));
      proc.on("error", () => resolve(""));
    });

  const SHELL_NAMES = new Set(["bash", "zsh", "sh", "fish", "ksh", "dash"]);

  // Walk the entire process tree and return the DEEPEST shell found.
  // e.g. nsenter → sh → python3 → su → bash
  //       sh is a wrapper (has children), bash is the interactive shell (leaf).
  const findInteractiveShell = async (rootPid: number, depth = 0): Promise<number | null> => {
    if (depth > 10) return null;
    const children = await getChildPids(rootPid);
    // Recurse into children first — deepest match wins
    for (const child of children) {
      const found = await findInteractiveShell(child, depth + 1);
      if (found) return found;
    }
    // If no deeper shell found, check if this node itself is a shell
    const comm = await getComm(rootPid);
    if (SHELL_NAMES.has(comm)) return rootPid;
    return null;
  };

  // Debug: show full process tree for a session
  app.get("/api/terminal-debug/:sessionId", async (req, res) => {
    const rootPid = sessionShells.get(req.params.sessionId);
    if (!rootPid) return res.json({ error: "session not found", sessions: [...sessionShells.keys()] });

    const buildTree = async (pid: number, depth = 0): Promise<any> => {
      if (depth > 10) return null;
      const comm = await getComm(pid);
      const children = await getChildPids(pid);
      return { pid, comm, children: await Promise.all(children.map(c => buildTree(c, depth + 1))) };
    };

    const tree = await buildTree(rootPid);
    const shellPid = await findInteractiveShell(rootPid);
    const shellChildren = shellPid ? await getChildPids(shellPid) : [];
    res.json({ rootPid, shellPid, shellChildren, busy: shellChildren.length > 0, tree });
  });

  app.get("/api/terminal-busy/:sessionId", async (req, res) => {
    const rootPid = sessionShells.get(req.params.sessionId);
    if (!rootPid) return res.json({ busy: false });

    try {
      const shellPid = await findInteractiveShell(rootPid);
      if (!shellPid) return res.json({ busy: false });

      // Busy = the interactive shell has child processes
      const children = await getChildPids(shellPid);
      res.json({ busy: children.length > 0 });
    } catch {
      res.json({ busy: false });
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    let shellProcess: ChildProcessWithoutNullStreams | null = null;
    const sessionId = Math.random().toString(36).substr(2, 12);

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
                finalArgs = ["-t", "1", "-m", "-u", "-i", "-n", "-p"];

                const hostUser = process.env.HOST_USER;
                if (!hostUser) {
                  console.warn('[konsolx] HOST_USER is not set. Terminals will run as root with no user environment. Set HOST_USER=$(whoami) in your compose command.');
                }
                // If HOST_USER is set, pty.spawn su so the host user's shell init
                // files (.bashrc, nvm, etc.) load with the correct HOME.
                // Otherwise fall back to spawning the shell directly (runs as root).
                const ptyTarget = hostUser
                  ? `["su", "-", "${hostUser}"]`
                  : `"${shellToTry}"`;
                const pythonCode = `import pty, signal; signal.signal(signal.SIGINT, signal.SIG_IGN); pty.spawn(${ptyTarget})`;

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
            console.log({useHostShell, finalShell})
            console.log(`Spawning: ${finalShell} ${finalArgs.join(' ')}`);
            console.log(`CWD: ${useHostShell ? 'Host' : (cwd || process.cwd())}`);

            // Build spawn environment.
            // In host-shell mode: start with a minimal base so container-specific vars
            // (PYTHONPATH, LD_LIBRARY_PATH, etc.) don't bleed into the host.
            // Crucially, do NOT hardcode HOME or PATH — let the host shell's rc files
            // (e.g. ~/.bashrc with nvm) initialise those naturally.
            let spawnEnv: any;
            if (useHostShell) {
              spawnEnv = {
                // Minimal safe base — host rc files will set PATH, HOME, NVM, etc.
                TERM: "xterm-256color",
                COLORTERM: "truecolor",
                LANG: "en_US.UTF-8",
                KONSOLX_HOST: "true",
                // Pass through user-defined env vars from the UI (workspace environments)
                ...env,
              };
            } else {
              spawnEnv = { ...process.env, ...env };
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

            // Track shell PID for busy detection
            if (shellProcess.pid) sessionShells.set(sessionId, shellProcess.pid);
            ws.send(JSON.stringify({ type: "session", sessionId }));

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

            const { initialCommand } = data;

            if (useHostShell) {
              const hostUser = process.env.HOST_USER;
              if (!hostUser) {
                ws.send(JSON.stringify({ type: "output", data: "\x1b[1;33m[Warning: HOST_USER not set — running as root. Start with: HOST_USER=$(whoami) docker compose up -d]\x1b[0m\r\n" }));
              }
              ws.send(JSON.stringify({ type: "output", data: "\x1b[1;32m[Connected to Host Shell]\x1b[0m\r\n" }));
            }

            // Wait for the shell prompt before sending setup commands.
            // This is more reliable than a fixed timeout — works regardless of
            // how long su - / nvm / .bashrc takes to initialize.
            const hasSetup = (env && Object.keys(env).length > 0) || (cwd && path.isAbsolute(cwd)) || initialCommand;
            if (hasSetup) {
              let promptDetected = false;
              const PROMPT_RE = /[\$#%>]\s*$/m;
              let promptBuf = '';

              const onData = (chunk: Buffer) => {
                if (promptDetected) return;
                promptBuf += chunk.toString();
                // Keep only last 512 chars to avoid unbounded growth
                if (promptBuf.length > 512) promptBuf = promptBuf.slice(-512);
                if (!PROMPT_RE.test(promptBuf)) return;
                promptDetected = true;

                if (!shellProcess || !shellProcess.stdin.writable) return;

                // 1. Export env vars
                if (env && Object.keys(env).length > 0) {
                  const exports = Object.entries(env)
                    .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
                    .join('\n');
                  shellProcess.stdin.write(`${exports}\n`);
                }

                // 2. cd to directory
                if (cwd && path.isAbsolute(cwd)) {
                  shellProcess.stdin.write(`cd "${cwd}"\n`);
                }

                // 3. Run initial command
                if (initialCommand) {
                  shellProcess.stdin.write(`${initialCommand}\n`);
                }
              };

              shellProcess.stdout.once('data', function waitForPrompt(chunk) {
                onData(chunk);
                if (!promptDetected) {
                  shellProcess!.stdout.once('data', waitForPrompt);
                }
              });

              // Fallback: if prompt never detected within 5s, send anyway
              setTimeout(() => {
                if (!promptDetected && shellProcess?.stdin.writable) {
                  promptDetected = true;
                  if (cwd && path.isAbsolute(cwd)) shellProcess.stdin.write(`cd "${cwd}"\n`);
                  if (initialCommand) shellProcess.stdin.write(`${initialCommand}\n`);
                }
              }, 5000);
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
        // Write all input (including Ctrl+C \x03, Ctrl+Z \x1a, Ctrl+\ \x1c) directly
        // to the PTY stdin. The PTY terminal driver converts control characters into
        // the correct signals for the foreground process only — the shell stays alive.
        shellProcess.stdin.write(data.data);
      } else if (data.type === "resize" && shellProcess) {
        // We can't easily resize a non-pty process, but we can update env for future processes
        // or some shells might pick up SIGWINCH if we could send it (but we can't easily without pty)
      }
    });

    ws.on("close", async () => {
      sessionShells.delete(sessionId);
      if (!shellProcess || !shellProcess.pid) return;

      const pid = shellProcess.pid;
      shellProcess = null; // prevent double-kill

      try {
        // Get the process group ID of the spawned process
        const pgidResult = await new Promise<string>((resolve) => {
          const p = spawn("ps", ["-o", "pgid=", "-p", String(pid)]);
          let out = "";
          p.stdout.on("data", (d) => out += d.toString());
          p.on("close", () => resolve(out.trim()));
          p.on("error", () => resolve(""));
        });

        const pgid = Number(pgidResult);
        if (pgid > 1) {
          // Kill entire process group
          try { process.kill(-pgid, "SIGKILL"); } catch (_) {}
        }

        // Also kill by PID tree — walk all descendants and kill them
        const killTree = async (rootPid: number) => {
          const children = await getChildPids(rootPid);
          for (const child of children) {
            await killTree(child);
          }
          try { process.kill(rootPid, "SIGKILL"); } catch (_) {}
        };
        await killTree(pid);
      } catch (_) {
        // Last resort
        try { process.kill(pid, "SIGKILL"); } catch (_) {}
      }
    });
  });

  // Vite middleware for development
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }
  const PORT = process.env.PORT;
  server.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
