import { app, BrowserWindow } from "electron";
import * as path from "path";
import isDev from "electron-is-dev";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import waitOn from "wait-on";

let backendProcess: any;

function startBackend() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const backendPath = path.join(__dirname, "build/server.js");

  console.log("Starting backend:", backendPath);

  const nodeExec = isDev ? "node" : process.execPath;

  backendProcess = spawn(nodeExec, [backendPath], {
    cwd: path.dirname(backendPath),
    stdio: "inherit",
  });

  backendProcess.on("error", (err) => {
    console.error("Backend failed to start:", err);
  });

  backendProcess.on("exit", (code) => {
    console.log("Backend exited with code", code);
  });
}

async function createWindow() {
  // wait until backend server is ready
  await waitOn({ resources: ["tcp:8012"] });

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  console.log(path.join(__dirname));
  const url = isDev
    ? "http://localhost:8012"
    : `file://${path.join(__dirname, "../dist/index.html")}`;

  console.log("Loading:", url);

  win.loadURL(url);

  if (isDev) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  startBackend();

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});