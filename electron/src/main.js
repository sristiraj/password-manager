const { app, BrowserWindow, Tray, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

const BACKEND_PORT = 8765;
let backendProcess = null;
let mainWindow = null;
let tray = null;

function startBackend() {
  if (!app.isPackaged) return;

  const backendDir = path.join(process.resourcesPath, "backend");
  const python = process.platform === "win32" ? "python" : "python3";
  backendProcess = spawn(python, ["-m", "uvicorn", "main:app", `--port=${BACKEND_PORT}`, "--host=127.0.0.1"], {
    cwd: backendDir,
    stdio: "pipe",
  });

  backendProcess.on("error", (err) => {
    console.error("Backend failed to start:", err);
  });
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const iconPath = path.join(__dirname, "../../extension/icons/icon16.png");
  tray = new Tray(iconPath);
  tray.setToolTip("Password Manager");

  const menu = Menu.buildFromTemplate([
    { label: "Open", click: showWindow },
    { type: "separator" },
    { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);

  tray.on("click", showWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

app.isQuitting = false;

app.whenReady().then(() => {
  startBackend();
  createTray();
  setTimeout(createWindow, app.isPackaged ? 1500 : 0);
});

// Keep the app alive when all windows are closed — tray keeps it running
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (backendProcess) backendProcess.kill();
});
