import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const db = require("./db.cjs");
const images = require("./images.cjs");
const Database = require("better-sqlite3");
const { developmentUrl, clientFile, allowedRequest } = require("./runtime.cjs");
const { verifyBundle } = require("./verify-bundle.cjs");
const temporary: string[] = [];
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "vona-offline-"));
  temporary.push(dir);
  return dir;
}
afterEach(() => { db.close(); temporary.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });

describe("desktop offline runtime rules", () => {
  it("never opens a development server from a packaged app", () => {
    expect(developmentUrl(true, "https://example.com")).toBeNull();
    expect(developmentUrl(true, "http://localhost:8080")).toBeNull();
    expect(developmentUrl(false, "http://localhost:8080")).toBe("http://localhost:8080/");
    expect(() => developmentUrl(false, "https://example.com")).toThrow();
  });
  it("serves local navigation but never serves HTML instead of missing modules", () => {
    const dir = workspace();
    writeFileSync(join(dir, "index.html"), "local shell");
    expect(clientFile(dir, "app://vona/library", true)).toBe(join(dir, "index.html"));
    expect(clientFile(dir, "app://vona/assets/missing.js", false)).toBeNull();
    expect(clientFile(dir, "app://vona/%2e%2e%2foutside.js", false)).toBeNull();
    expect(clientFile(dir, "app://elsewhere/", true)).toBeNull();
  });
  it("blocks all external network dependencies in production", () => {
    expect(allowedRequest("https://example.com/image.jpg", null)).toBe(false);
    expect(allowedRequest("http://localhost:8080", null)).toBe(false);
    expect(allowedRequest("app://vona/library", null)).toBe(true);
    expect(allowedRequest("local://pose.jpg", null)).toBe(true);
    expect(allowedRequest("data:image/png;base64,abcd", null)).toBe(true);
  });
  it("refuses incomplete or online-dependent desktop bundles", () => {
    const dir = workspace();
    expect(() => verifyBundle(dir)).toThrow();
    writeFileSync(join(dir, "index.html"), '<script src="/missing.js"></script>');
    expect(() => verifyBundle(dir)).toThrow();
    writeFileSync(join(dir, "index.html"), '<script src="https://example.com/app.js"></script>');
    expect(() => verifyBundle(dir)).toThrow();
    writeFileSync(join(dir, "app.js"), "void 0");
    writeFileSync(join(dir, "index.html"), '<script src="/app.js"></script>');
    expect(verifyBundle(dir)).toBe(1);
  });
});

describe("durable SQLite and filesystem work without a network", () => {
  it("opens all bundled poses and photos locally on first launch", () => {
    db.init(join(workspace(), "vona.db"));
    expect(db.listPoses().map((p: any) => p.name)).toEqual(["kikikasana", "suddassna"]);
    expect(db.listPoses().every((p: any) => p.image_url.startsWith("data:image/"))).toBe(true);
    expect(db.listPoses().every((p: any) => p.categories.length === 1 && p.practice_assignment === "yoga")).toBe(true);
  });
  it("adds a photo and pose, edits and reorders a sequence, and keeps data after restarting", () => {
    const dir = workspace(); const file = join(dir, "vona.db");
    db.init(file); images.init(join(dir, "images"));
    const photo = images.importBase64("pose.png", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N0AAAAASUVORK5CYII=");
    const yoga = db.listCategories().find((c: any) => c.practice_type === "yoga");
    const pose = db.upsertPose({ name: "Offline new pose", difficulty: "beginner", image_url: photo, categoryIds: [yoga.id], subcategoryIds: [], tagIds: [] });
    const sequence = db.createSequence({ title: "Offline Yoga", practice_type: "yoga" });
    db.addPoseToSequence(sequence, pose);
    db.addPoseToSequence(sequence, "1500c01e-f571-47b5-a37a-0bf8c2eb2893");
    let items = db.getSequence(sequence).items;
    db.reorderSequenceItems(sequence, [items[1].id, items[0].id]);
    db.updateSequenceItem(items[0].id, { notes: "Local alignment" });
    db.updateSequence(sequence, { title: "Saved offline", practice_notes: "Нотатки" });
    db.close(); db.init(file); images.init(join(dir, "images"));
    const reopened = db.getSequence(sequence);
    expect(reopened.title).toBe("Saved offline");
    expect(reopened.practice_notes).toBe("Нотатки");
    expect(reopened.items.map((i: any) => i.pose_id)).toEqual(["1500c01e-f571-47b5-a37a-0bf8c2eb2893", pose]);
    expect(reopened.items[1].notes).toBe("Local alignment");
    expect(images.readDataUrl(reopened.items[1].pose.image_url).startsWith("data:image/png;base64,")).toBe(true);
    db.removeSequenceItem(reopened.items[0].id);
    expect(db.getSequence(sequence).items.map((i: any) => i.pose_id)).toEqual([pose]);
  });
  it("rolls back an interrupted or invalid pose update including relationships", () => {
    db.init(join(workspace(), "vona.db"));
    const original = db.listPoses()[0];
    expect(() => db.upsertPose({ ...original, name: "Must roll back", categoryIds: ["missing-category"], subcategoryIds: [], tagIds: [] })).toThrow();
    const unchanged = db.listPoses().find((p: any) => p.id === original.id);
    expect(unchanged.name).toBe(original.name);
    expect(unchanged.categories).toEqual(original.categories);
    expect(unchanged.subcategory_ids).toEqual(original.subcategory_ids);
  });
  it("backs up existing WAL data and never replaces edited or deleted seed poses", () => {
    const file = join(workspace(), "vona.db"); db.init(file);
    db.updateSequence(db.createSequence({ title: "Existing work" }), { practice_notes: "Keep me" });
    const original = db.listPoses()[0];
    db.upsertPose({ ...original, name: "My edited pose", categoryIds: original.categories.map((c: any) => c.id), subcategoryIds: original.subcategory_ids, tagIds: [] });
    db.removePose("fd9316fa-b333-4319-bc45-f0d63852f7d9");
    // Simulate an existing pre-upgrade workspace rather than a new install.
    const raw = new Database(file);
    raw.prepare("DELETE FROM app_meta WHERE key = 'bundled_library_v1'").run();
    raw.close();
    db.close(); db.init(file);
    expect(db.listPoses().find((p: any) => p.id === original.id).name).toBe("My edited pose");
    expect(existsSync(`${file}.before-offline-v1.bak`)).toBe(true);
    const backup = new Database(`${file}.before-offline-v1.bak`, { readonly: true });
    expect(backup.prepare("SELECT practice_notes FROM sequences WHERE title = 'Existing work'").get().practice_notes).toBe("Keep me");
    backup.close();
    expect(readFileSync(`${file}.before-offline-v1.bak`).byteLength).toBeGreaterThan(0);
    db.removePose("fd9316fa-b333-4319-bc45-f0d63852f7d9");
    db.close(); db.init(file);
    expect(db.listPoses().map((p: any) => p.name)).toEqual(["My edited pose"]);
  });
});