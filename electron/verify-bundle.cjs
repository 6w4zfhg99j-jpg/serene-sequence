const fs = require("node:fs");
const path = require("node:path");

function verifyBundle(root) {
  const index = path.join(root, "index.html");
  if (!fs.existsSync(index)) throw new Error("Missing dist/client/index.html. Run the desktop build before packaging.");
  const html = fs.readFileSync(index, "utf8");
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
  for (const reference of references) {
    if (/^https?:/.test(reference)) throw new Error("Desktop shell references an online resource");
    if (reference.startsWith("data:") || reference.startsWith("#")) continue;
    const file = path.resolve(root, reference.replace(/^\//, "").split(/[?#]/)[0]);
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || !fs.existsSync(file)) throw new Error(`Missing bundled asset: ${reference}`);
  }
  if (!references.some((ref) => /\.js(?:[?#]|$)/.test(ref))) throw new Error("Desktop shell has no bundled JavaScript entry");
  const library = require("./library.json");
  if (library.poses.some((pose) => pose.image_url && !pose.image_url.startsWith("data:image/"))) throw new Error("Bundled pose photos must be local");
  return references.length;
}

if (require.main === module) {
  console.log(`Verified ${verifyBundle(path.join(__dirname, "..", "dist", "client"))} locally bundled shell resources.`);
}
module.exports = { verifyBundle };