// electron/main.cjs — Electron main process
const { app, BrowserWindow, protocol, ipcMain, dialog, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const db = require("./db.cjs");
const images = require("./images.cjs");

const isDev = !!process.env.ELECTRON_START_URL;

// Menu bar / Dock title (matches productName in electron-builder.yml).
app.setName("VONA");

// The renderer is a static SPA built into dist/client. It references its assets
// with absolute paths ("/assets/..."), which cannot resolve over file://.
// We therefore serve it from a custom "app://" scheme with an SPA fallback.
const CLIENT_DIR = path.join(__dirname, "..", "dist", "client");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
  {
    scheme: "local",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function ensureDirs() {
  const dir = path.join(app.getPath("userData"), "vona");
  const imgDir = path.join(dir, "images");
  fs.mkdirSync(imgDir, { recursive: true });
  return { dir, imgDir };
}

function createWindow() {
  const win = new BrowserWindow({
    title: "VONA",
    width: 1400,
    height: 900,
    backgroundColor: "#fbf9f4",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    win.loadURL("app://vona/");
  }
}

function serveClient(imgDir) {
  // app:// — the built SPA, with a fallback to index.html for client routes.
  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
    let file = path.join(CLIENT_DIR, rel);
    if (!file.startsWith(CLIENT_DIR) || !rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(CLIENT_DIR, "index.html");
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  // local:// — user photos stored in the app data folder.
  // URLs look like "local://<uuid>.jpg". Because "local" is registered as a
  // standard scheme, the filename lands in the hostname and pathname is "/",
  // so we join both and strip any surrounding slashes before resolving.
  protocol.handle("local", async (request) => {
    try {
      const { hostname, pathname } = new URL(request.url);
      const rel = decodeURIComponent(`${hostname}${pathname}`)
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const name = path.basename(rel);
      const file = path.join(imgDir, name);
      if (!name || !file.startsWith(imgDir) || !fs.existsSync(file)) {
        console.error("[local] not found:", request.url, "->", file);
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(file).toString());
    } catch (err) {
      console.error("[local] failed:", request.url, err);
      return new Response("Error", { status: 500 });
    }
  });
}

app.whenReady().then(() => {
  const { dir, imgDir } = ensureDirs();

  try {
    db.init(path.join(dir, "vona.db"));
    images.init(imgDir);
  } catch (err) {
    dialog.showErrorBox(
      "VONA could not start",
      `The local database failed to open.\n\n${err && err.stack ? err.stack : String(err)}`,
    );
    app.quit();
    return;
  }

  serveClient(imgDir);

  // ---------- IPC handlers ----------
  // Wrap every handler so a failure surfaces in the renderer instead of
  // silently resolving to undefined.
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await fn(event, ...args);
      } catch (err) {
        console.error(`[ipc] ${channel} failed:`, err);
        throw err;
      }
    });
  };

  handle("poses.list", () => db.listPoses());
  handle("poses.upsert", (_e, input) => db.upsertPose(input));
  handle("poses.toggleFavorite", (_e, id, next) => db.toggleFavorite(id, next));
  handle("poses.remove", (_e, id) => db.removePose(id));

  handle("categories.list", () => db.listCategories());
  handle("categories.create", (_e, name) => db.createCategory(name));
  handle("categories.update", (_e, id, name) => db.updateCategory(id, name));
  handle("categories.remove", (_e, id) => db.deleteCategory(id));
  handle("categories.reorder", (_e, ids) => db.reorderCategories(ids));

  handle("subcategories.list", () => db.listSubcategories());
  handle("subcategories.create", (_e, categoryId, name) =>
    db.createSubcategory(categoryId, name),
  );
  handle("subcategories.update", (_e, id, name) => db.updateSubcategory(id, name));
  handle("subcategories.remove", (_e, id) => db.deleteSubcategory(id));
  handle("subcategories.reorder", (_e, ids) => db.reorderSubcategories(ids));


  handle("tags.list", () => db.listTags());
  handle("tags.create", (_e, name) => db.createTag(name));
  handle("tags.update", (_e, id, name) => db.updateTag(id, name));
  handle("tags.merge", (_e, sourceId, targetId) => db.mergeTags(sourceId, targetId));
  handle("tags.remove", (_e, id) => db.deleteTag(id));

  handle("folders.list", () => db.listFolders());
  handle("folders.create", (_e, name, parentId) => db.createFolder(name, parentId));
  handle("folders.update", (_e, id, name) => db.updateFolder(id, name));
  handle("folders.remove", (_e, id) => db.deleteFolder(id));
  handle("folders.move", (_e, id, parentId) => db.moveFolder(id, parentId));
  handle("folders.reorder", (_e, ids) => db.reorderFolders(ids));

  handle("sequences.list", () => db.listSequences());
  handle("sequences.get", (_e, id) => db.getSequence(id));
  handle("sequences.create", (_e, input) => db.createSequence(input));
  handle("sequences.update", (_e, id, patch) => db.updateSequence(id, patch));
  handle("sequences.setTags", (_e, id, tagIds) => db.setSequenceTags(id, tagIds));
  handle("sequences.remove", (_e, id) => db.deleteSequence(id));
  handle("sequences.duplicate", (_e, id) => db.duplicateSequence(id));
  handle("sequences.addPose", (_e, sid, pid) => db.addPoseToSequence(sid, pid));
  handle("sequences.removeItem", (_e, itemId) => db.removeSequenceItem(itemId));
  handle("sequences.duplicateItem", (_e, item) => db.duplicateSequenceItem(item));
  handle("sequences.updateItem", (_e, itemId, patch) =>
    db.updateSequenceItem(itemId, patch),
  );
  handle("sequences.reorder", (_e, sid, orderedIds) =>
    db.reorderSequenceItems(sid, orderedIds),
  );

  handle("images.importBase64", (_e, name, base64) =>
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
