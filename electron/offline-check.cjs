// Launch the real installed Mac app with an isolated profile and network-denying runtime.
// This is a manual acceptance-test launcher, not a claim of automated UI verification.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

if (process.platform !== "darwin") {
  console.error("The packaged macOS acceptance check must run on a Mac.");
  process.exit(1);
}
const executable = process.argv[2] || "/Applications/VONA.app/Contents/MacOS/VONA";
if (!fs.existsSync(executable)) {
  console.error("Install the newly built VONA app in Applications, then run this check again.");
  process.exit(1);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vona-offline-check-"));
console.log("Disconnect Wi-Fi and Ethernet before testing. Test profile:", profile);
console.log("Follow the checklist in DESKTOP.md. Production runtime blocks external requests independently of Wi-Fi.");
const env = { ...process.env, VONA_OFFLINE_TEST_DATA: profile };
delete env.ELECTRON_START_URL;
const run = () => {
  const child = spawn(executable, [], { env, stdio: "inherit" });
  child.on("error", () => { console.error("Could not launch the packaged VONA app."); process.exitCode = 1; });
  return child;
};
run().on("exit", (code) => {
  if (code !== 0) { process.exitCode = code ?? 1; return; }
  console.log("Relaunching the same offline profile: check your saved poses, images and sequences.");
  run().on("exit", (secondCode) => {
    process.exitCode = secondCode ?? 1;
    console.log("Test data retained at", profile, "— personal application data was not used.");
  });
});