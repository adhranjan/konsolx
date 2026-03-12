import { app, BrowserWindow } from "electron";
import path from "path";
import isDev from "electron-is-dev";
import { spawn } from "child_process";
import waitOn from "wait-on";
import { fileURLToPath } from "url";

let backendProcess: any;

function startBackend() {
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendPath = path.join(__dirname, "build/server.js");

  backendProcess = spawn("node", [backendPath], {
    cwd: path.dirname(backendPath),
    stdio: "inherit",
    shell: true,
  });

  backendProcess.on("exit", (code) => {
    console.log("Backend exited with code", code);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  const url = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../dist/index.html")}`;

  if (isDev) {
    // wait for backend optional
    try {
      await waitOn({ resources: ["http://localhost:8012/api/health"], timeout: 10000 });
    } catch {
      console.warn("Backend did not respond in time.");
    }
  }

  win.loadURL(url);


  win.webContents.openDevTools();
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== "darwin") app.quit();
});