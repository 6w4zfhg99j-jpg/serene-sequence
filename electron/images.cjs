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

module.exports = { init, importBase64 };
