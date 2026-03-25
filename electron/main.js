import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRendererEntry() {
  // We load the production build from `dist/` (Vite output).
  const distIndex = path.join(__dirname, "..", "dist", "index.html");
  if (fs.existsSync(distIndex)) return distIndex;

  // Fallback (dev): try loading from Vite dev server if present.
  // You can enhance this later if needed.
  return null;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      // Security defaults: no direct Node access in the renderer.
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "..", "public", "icons", "icon-512.png"),
  });

  const entry = getRendererEntry();
  if (entry) {
    mainWindow.loadFile(entry);
  } else {
    // If dist isn't present yet, load Vite dev server URL.
    mainWindow.loadURL("http://localhost:5173/");
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

