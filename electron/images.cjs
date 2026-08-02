// electron/images.cjs — copies uploaded photos into the local images folder.
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

let imagesDir;

function init(dir) {
  imagesDir = dir;
  fs.mkdirSync(imagesDir, { recursive: true });
}

function extFromName(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || "");
  const ext = (m ? m[1] : "jpg").toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "jpg";
}

function importBase64(originalName, base64) {
  if (!imagesDir) throw new Error("images store not initialised");
  const ext = extFromName(originalName);
  const filename = `${randomUUID().toLowerCase()}.${ext}`;
  const abs = path.join(imagesDir, filename);
  const raw = String(base64 || "");
  const payload = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(abs, Buffer.from(payload, "base64"));
  if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
    throw new Error(`failed to save image at ${abs}`);
  }
  return `local://${filename}`;
}

const MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
};

/**
 * Reads a stored image straight off disk and returns it as a data URL.
 * Used by the PDF exporter so it never depends on the renderer being able to
 * fetch the custom local:// scheme (which CSP can block).
 */
function readDataUrl(ref) {
  if (!imagesDir) throw new Error("images store not initialised");
  const raw = String(ref || "").replace(/^local:\/\//, "");
  const name = path.basename(decodeURIComponent(raw).replace(/^\/+|\/+$/g, ""));
  const abs = path.join(imagesDir, name);
  if (!name || !abs.startsWith(imagesDir) || !fs.existsSync(abs)) {
    throw new Error(`image not found: ${ref} -> ${abs}`);
  }
  const ext = extFromName(name);
  const mime = MIME[ext] || "application/octet-stream";
  return `data:${mime};base64,${fs.readFileSync(abs).toString("base64")}`;
}

module.exports = { init, importBase64, readDataUrl };

