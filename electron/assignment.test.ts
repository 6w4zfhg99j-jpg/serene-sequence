import { createRequire } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scopePracticeLibrary } from "../src/lib/practice-library";

const require = createRequire(import.meta.url);
const db = require("./db.cjs"); const Database = require("better-sqlite3");
const dirs: string[] = [];
function workspace() { const dir = mkdtempSync(join(tmpdir(), "vona-assignment-")); dirs.push(dir); const file = join(dir, "vona.db"); db.init(file); return file; }
afterEach(() => { db.close(); dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });
function visible(mode: "yoga" | "stretching") { return scopePracticeLibrary(db.listPoses(), db.listCategories(), db.listSubcategories(), mode).poses; }

describe("offline SQLite exercise assignment", () => {
  it.each(["yoga", "stretching", "both"])("persists %s membership in one record and displays the right libraries", (assignment) => {
    const file = workspace();
    const id = db.upsertPose({ name: "Unique exercise", difficulty: "beginner", practice_assignment: assignment, categoryIds: [], subcategoryIds: [], tagIds: [] });
    db.close(); db.init(file);
    expect(db.listPoses().filter((p: any) => p.id === id)).toHaveLength(1);
    expect(visible("yoga").some((p) => p.id === id)).toBe(assignment !== "stretching");
    expect(visible("stretching").some((p) => p.id === id)).toBe(assignment !== "yoga");
  });
  it("shares edits and retains sequence references even after removing Stretching membership", () => {
    workspace();
    const input = { name: "Shared", difficulty: "beginner", practice_assignment: "both", categoryIds: [], subcategoryIds: [], tagIds: [] };
    const id = db.upsertPose(input);
    const sequence = db.createSequence({ title: "Saved Stretching", practice_type: "stretching" });
    db.addPoseToSequence(sequence, id); const itemId = db.getSequence(sequence).items[0].id;
    db.upsertPose({ ...input, id, name: "Changed shared information", description: "New notes", practice_assignment: "yoga" });
    expect(visible("stretching").some((p) => p.id === id)).toBe(false);
    const saved = db.getSequence(sequence);
    expect(saved.items.map((p: any) => p.id)).toEqual([itemId]);
    expect(saved.items[0].pose.name).toBe("Changed shared information");
    expect(saved.items[0].pose.description).toBe("New notes");
  });
  it("does not auto-share Yoga while initializing independent Stretching organization", () => {
    workspace();
    expect(visible("stretching")).toEqual([]);
    expect(visible("yoga").map((p) => p.name)).toEqual(["kikikasana", "suddassna"]);
    expect(db.listCategories().filter((c: any) => c.practice_type === "stretching")).toHaveLength(12);
  });
  it("backs up and preserves legacy categories, poses and saved items during assignment upgrade", () => {
    const file = workspace();
    const original = db.listPoses()[0];
    const category = db.listCategories().find((c: any) => c.practice_type === "stretching");
    const sequence = db.createSequence({ title: "Existing work", practice_type: "stretching" });
    db.addPoseToSequence(sequence, original.id); db.close();
    const raw = new Database(file);
    raw.prepare("INSERT INTO pose_categories (pose_id, category_id) VALUES (?, ?)").run(original.id, category.id);
    // This temporary test database models a pre-assignment schema, never real data.
    raw.exec("ALTER TABLE poses DROP COLUMN practice_assignment");
    raw.prepare("DELETE FROM app_meta WHERE key = 'pose_assignments_v1'").run(); raw.close();
    db.init(file);
    expect(db.listPoses().find((p: any) => p.id === original.id).practice_assignment).toBe("yoga");
    expect(db.listPoses().find((p: any) => p.id === original.id).categories).toHaveLength(2);
    expect(db.getSequence(sequence).items.map((i: any) => i.pose_id)).toEqual([original.id]);
    expect(existsSync(`${file}.before-pose-assignment-v1.bak`)).toBe(true);
  });
});