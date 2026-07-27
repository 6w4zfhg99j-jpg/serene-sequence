// electron/main.cjs — Electron main process
const { app, BrowserWindow, protocol, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

const db = require("./db.cjs");
const images = require("./images.cjs");

const isDev = !!process.env.ELECTRON_START_URL;

function ensureDirs() {
  const dir = path.join(app.getPath("userData"), "asana");
  const imgDir = path.join(dir, "images");
  fs.mkdirSync(imgDir, { recursive: true });
  return { dir, imgDir };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#fbf9f4",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    win.loadURL(
      url.format({ pathname: indexHtml, protocol: "file:", slashes: true }),
    );
  }
}

app.whenReady().then(() => {
  const { dir, imgDir } = ensureDirs();
  db.init(path.join(dir, "asana.db"));
  images.init(imgDir);

  // Serve local://<file> from the images directory.
  protocol.registerFileProtocol("local", (request, callback) => {
    const rel = decodeURIComponent(request.url.replace(/^local:\/\//, ""));
    callback({ path: path.join(imgDir, rel) });
  });

  // ---------- IPC handlers ----------
  ipcMain.handle("poses.list", () => db.listPoses());
  ipcMain.handle("poses.upsert", (_e, input) => db.upsertPose(input));
  ipcMain.handle("poses.toggleFavorite", (_e, id, next) => db.toggleFavorite(id, next));
  ipcMain.handle("poses.remove", (_e, id) => db.removePose(id));

  ipcMain.handle("categories.list", () => db.listCategories());

  ipcMain.handle("tags.list", () => db.listTags());
  ipcMain.handle("tags.create", (_e, name) => db.createTag(name));

  ipcMain.handle("sequences.list", () => db.listSequences());
  ipcMain.handle("sequences.get", (_e, id) => db.getSequence(id));
  ipcMain.handle("sequences.create", (_e, input) => db.createSequence(input));
  ipcMain.handle("sequences.update", (_e, id, patch) => db.updateSequence(id, patch));
  ipcMain.handle("sequences.setTags", (_e, id, tagIds) => db.setSequenceTags(id, tagIds));
  ipcMain.handle("sequences.remove", (_e, id) => db.deleteSequence(id));
  ipcMain.handle("sequences.duplicate", (_e, id) => db.duplicateSequence(id));
  ipcMain.handle("sequences.addPose", (_e, sid, pid) => db.addPoseToSequence(sid, pid));
  ipcMain.handle("sequences.removeItem", (_e, itemId) => db.removeSequenceItem(itemId));
  ipcMain.handle("sequences.duplicateItem", (_e, item) => db.duplicateSequenceItem(item));
  ipcMain.handle("sequences.updateItem", (_e, itemId, patch) =>
    db.updateSequenceItem(itemId, patch),
  );
  ipcMain.handle("sequences.reorder", (_e, sid, orderedIds) =>
    db.reorderSequenceItems(sid, orderedIds),
  );

  ipcMain.handle("images.importBase64", (_e, name, base64) =>
    images.importBase64(name, base64),
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
