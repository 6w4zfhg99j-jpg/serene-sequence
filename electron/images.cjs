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
  return (m ? m[1] : "jpg").toLowerCase();
}

function importBase64(originalName, base64) {
  const ext = extFromName(originalName);
  const filename = `${randomUUID()}.${ext}`;
  const abs = path.join(imagesDir, filename);
  fs.writeFileSync(abs, Buffer.from(base64, "base64"));
  return `local://${filename}`;
}

module.exports = { init, importBase64 };
