// electron/main.cjs — Electron main process
const { app, BrowserWindow, protocol, ipcMain, dialog, net, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const { developmentUrl, clientFile, allowedRequest } = require("./runtime.cjs");
let db;
let images;
const devUrl = developmentUrl(app.isPackaged, process.env.ELECTRON_START_URL);
const isDev = Boolean(devUrl);

// Menu bar / Dock title (matches productName in electron-builder.yml).
app.setName("VONA");
// The test runner supplies a separate temporary profile; never touch personal work.
if (process.env.VONA_OFFLINE_TEST_DATA) app.setPath("userData", process.env.VONA_OFFLINE_TEST_DATA);

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
    icon: isDev
      ? path.join(__dirname, "..", "public", "icon.png")
      : path.join(CLIENT_DIR, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!allowedRequest(url, devUrl) || !["app:", "http:", "https:"].includes(new URL(url).protocol)) event.preventDefault();
  });
  win.loadURL(devUrl ?? "app://vona/").catch((error) => {
    dialog.showErrorBox("VONA could not load", `The locally bundled interface could not open. Your saved data has not been removed.\n\n${error.message}`);
  });
}

function serveClient(imgDir) {
  // app:// — the built SPA, with a fallback to index.html for client routes.
  protocol.handle("app", async (request) => {
    try {
      const navigation = request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
      const file = clientFile(CLIENT_DIR, request.url, Boolean(navigation));
      if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
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
    if (!isDev && !fs.existsSync(path.join(CLIENT_DIR, "index.html"))) throw new Error("The desktop interface is missing. Build VONA using desktop:dmg, not the web build.");
    db = require("./db.cjs");
    images = require("./images.cjs");
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
  // The desktop core has no online features: do not allow accidental Cloud/CDN calls.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !allowedRequest(details.url, devUrl) });
  });

  // ---------- IPC handlers ----------
  // Wrap every handler so a failure surfaces in the renderer instead of
  // silently resolving to undefined.
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        const origin = event.senderFrame?.url;
        if (!origin || !allowedRequest(origin, devUrl)) throw new Error("Untrusted storage request");
        return await fn(event, ...args);
      } catch (err) {
        console.error(`[ipc] ${channel} failed:`, err);
        throw err;
      }
    });
  };

  handle("poses.list", () => db.listPoses());
  handle("poses.upsert", (_e, input) => db.upsertPose(input));
  handle("poses.reorder", (_e, orderedIds) => db.reorderPoses(orderedIds));
  handle("poses.toggleFavorite", (_e, id, next) => db.toggleFavorite(id, next));
  handle("poses.remove", (_e, id) => db.removePose(id));

  handle("categories.list", () => db.listCategories());
  handle("categories.create", (_e, name, practice) => db.createCategory(name, practice));
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
  handle("sequences.listTrash", () => db.listTrashedSequences());
  handle("sequences.restore", (_e, id) => db.restoreSequence(id));
  handle("sequences.purge", (_e, id) => db.purgeSequence(id));
  handle("sequences.emptyTrash", () => db.emptyTrash());
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
  handle("images.readDataUrl", (_e, ref) => images.readDataUrl(ref));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => db?.close());
