const fs = require("node:fs");
const path = require("node:path");

function developmentUrl(isPackaged, value) {
  if (isPackaged || !value) return null;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Desktop development must use a local development server");
  }
  return url.href;
}

function clientFile(clientDir, requestUrl, navigation) {
  const url = new URL(requestUrl);
  if (url.protocol !== "app:" || url.hostname !== "vona") return null;
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(clientDir, relative);
  const inside = path.relative(clientDir, file);
  if (inside.startsWith("..") || path.isAbsolute(inside)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (navigation && !path.extname(relative)) return path.join(clientDir, "index.html");
  return null;
}

function allowedRequest(requestUrl, devUrl) {
  try {
    const url = new URL(requestUrl);
    if (["data:", "blob:", "local:", "file:"].includes(url.protocol)) return true;
    if (url.protocol === "app:") return url.hostname === "vona";
    if (!devUrl) return false;
    const dev = new URL(devUrl);
    return url.hostname === dev.hostname && url.port === dev.port && ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
  } catch { return false; }
}

module.exports = { developmentUrl, clientFile, allowedRequest };