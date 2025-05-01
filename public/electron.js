const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");

const Store = require("electron-store").default;
const store = new Store();

let mainWindow;
const env = process.env.NODE_ENV || "development";

if (env === "development") {
  require("electron-reload")(__dirname, {
    electron: path.join(__dirname, "..", "node_modules", ".bin", "electron"),
    hardResetMethod: "exit",
  });
}

// Store multiple downloads
let activeDownloads = {};
let activeProcesses = {};
let successfulDownloads = {};
let failedDownloads = {};
let metadataCache = {};

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
    },
  });

  ipcMain.on("global-reset", () => {
    Object.keys(activeProcesses).forEach((id) => {
      activeProcesses[id].kill("SIGTERM");
      delete activeProcesses[id];
    });

    activeDownloads = {};
    activeProcesses = {};
    successfulDownloads = {};
    failedDownloads = {};
    metadataCache = {};
  });

  mainWindow.loadURL("http://localhost:3000");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Fetch video metadata (title & thumbnail)
ipcMain.handle("fetch-video-metadata", async (_event, url) => {
  return await new Promise((resolve) => {
    const cacheEntry = metadataCache[url];
    if (cacheEntry && cacheEntry.timestamp && Date.now() - cacheEntry.timestamp < 60000) {
      resolve(cacheEntry);
      return;
    }

    metadataCache[url] = {};

    exec(
      `yt-dlp --get-title --get-thumbnail --get-duration --cookies-from-browser chrome ${url}`,
      (error, stdout) => {
        if (error) {
          resolve({ title: "Unknown", thumbnail: "", error: `Error fetching metadata: ${error.message}` });
        } else {
          const [title, thumbnail, duration] = stdout.trim().split("\n");
          const now = Date.now();

          metadataCache[url] = { title, thumbnail, duration, timestamp: now };

          resolve(metadataCache[url]);
        }
      }
    );
  });
});

ipcMain.on("download-video", (event, { id, url, folderPath, quality }) => {
  const command = "yt-dlp";
  const args = [
    "-o",
    `${folderPath}/%(title)s.%(ext)s`,
    "-f",
    `bv*[height=${quality}]+ba`,
    "--merge-output-format",
    "mp4",
    "--cookies-from-browser",
    "chrome",
    url,
  ];

  const process = spawn(command, args);
  activeDownloads[url] = id;
  activeProcesses[id] = process;

  process.stdout.on("data", (data) => {
    event.reply("download-progress", { id, progress: data.toString() });
  });

  process.stderr.on("data", (data) => {
    event.reply("download-error", { id, error: data.toString() });
  });

  process.on("close", (code) => {
    if (code === 0) {
      event.reply("download-progress", {
        id,
        progress: "Download complete!",
      });

      successfulDownloads[url] = id;
    } else {
      event.reply("download-error", {
        id,
        error: "Download failed",
      });

      failedDownloads[url] = id;
    }

    delete activeDownloads[url];
    delete activeProcesses[id];
  });
});

// Handle folder selection
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.filePaths[0] || null;
});

ipcMain.handle("store-set", (_event, key, value) => {
  store.set(key, value);
});

ipcMain.handle("store-get", (_event, key) => {
  return store.get(key);
});
