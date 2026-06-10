import { app, BrowserWindow, shell } from "electron";
import { createConnection, createServer as createNetServer } from "net";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT ?? 8016);

// Set consistent data path before anything else — prevents falling back to "Electron" folder
app.setName("Konsolx");
app.setPath("userData", path.join(app.getPath("home"), ".config", "konsolx"));

let win: BrowserWindow | null = null;

// ── Singleton lock ────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running — quit immediately
  app.quit();
  process.exit(0);
}

// If a second instance is launched, focus the existing window
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// ── Find a free port ─────────────────────────────────────────────────────────
function findFreePort(preferred: number): Promise<number> {
  return new Promise(resolve => {
    const srv = createConnection({ port: preferred }, () => {
      // Port is in use — let OS assign a free one
      srv.destroy();
      const finder = createNetServer();
      finder.listen(0, () => {
        const port = (finder.address() as { port: number }).port;
        finder.close(() => resolve(port));
      });
    });
    srv.on("error", () => resolve(preferred)); // Port is free
  });
}

// ── Ensure DATA_DIR exists ───────────────────────────────────────────────────
const dataDir = path.join(app.getPath("userData"), "konsolx-data");
fs.mkdirSync(dataDir, { recursive: true });
process.env.DATA_DIR       = dataDir;
process.env.USE_HOST_SHELL = "false";  // Running natively — no nsenter/Docker needed
process.env.USE_SSH_SHELL  = "false";
process.env.HOST_USER      = process.env.USER ?? process.env.USERNAME ?? "";
process.env.HOST_OS        = process.platform === "darwin" ? "mac" : "linux";
process.env.PORT           = String(PORT);

// ── Wait for Express to be ready ─────────────────────────────────────────────
function waitForServer(port: number, retries = 40): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const client = createConnection({ port }, () => {
        client.destroy();
        resolve();
      });
      client.on("error", () => {
        if (++attempts >= retries) return reject(new Error("Server did not start in time"));
        setTimeout(check, 300);
      });
    };
    check();
  });
}

// ── Create the Electron window ────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    title: "Konsolx",
    icon: path.join(ROOT, "build-assets", "512x512.png"),
    backgroundColor: "#0a0a0a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const port = Number(process.env.PORT ?? PORT);
  win.loadURL(`http://localhost:${port}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => { win = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const port = await findFreePort(PORT);
  process.env.PORT = String(port);

  // Import the server entry — it self-starts on import (top-level startServer() call)
  const serverEntry = path.join(ROOT, "build", "server.js");
  await import(`file://${serverEntry}`);
  // Wait for Express to be ready before opening the window
  await waitForServer(port);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
