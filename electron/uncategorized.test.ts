import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { groupLibraryPoses, UNCATEGORIZED_ID } from "../src/lib/pose-categories";
import { scopePracticeLibrary } from "../src/lib/practice-library";

const require = createRequire(import.meta.url);
const db = require("./db.cjs");
const dirs: string[] = [];
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "vona-uncategorized-")); dirs.push(dir);
  const file = join(dir, "vona.db"); db.init(file); return file;
}
function unassigned(mode: "yoga" | "stretching" = "yoga") {
  const scoped = scopePracticeLibrary(db.listPoses(), db.listCategories(), db.listSubcategories(), mode);
  return groupLibraryPoses(scoped.poses, scoped.categories).find((g) => !g.category)?.poses.map((p) => p.id);
}
afterEach(() => { db.close(); dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });
const input = { name: "Local exercise", difficulty: "beginner", practice_assignment: "both", categoryIds: [], subcategoryIds: [], tagIds: [] };

describe("Uncategorized in reopened desktop SQLite workspaces", () => {
  it("includes a new unassigned pose in both libraries after closing and reopening", () => {
    const file = workspace(); const id = db.upsertPose(input);
    db.close(); db.init(file);
    expect(unassigned("yoga")).toContain(id);
    expect(unassigned("stretching")).toContain(id);
  });
  it("removes an assigned pose from both system sections after restart without duplicating records", () => {
    const file = workspace(); const id = db.upsertPose(input);
    const category = db.listCategories()[0];
    db.upsertPose({ ...input, id, categoryIds: [category.id] });
    db.close(); db.init(file);
    expect(unassigned("yoga")).not.toContain(id);
    expect(unassigned("stretching")).not.toContain(id);
    expect(db.listPoses().filter((p: { id: string }) => p.id === id)).toHaveLength(1);
  });
  it("returns a pose when its last category is removed and preserves existing categories and saved items after restart", () => {
    const file = workspace(); const before = db.listCategories();
    const id = db.upsertPose({ ...input, categoryIds: [before[0].id] });
    const sequence = db.createSequence({ title: "Keep saved items" }); db.addPoseToSequence(sequence, id);
    const items = db.getSequence(sequence).items.map((i: { id: string }) => i.id);
    db.upsertPose({ ...input, id }); db.close(); db.init(file);
    expect(unassigned()).toContain(id);
    expect(db.listCategories()).toEqual(before);
    expect(db.getSequence(sequence).items.map((i: { id: string }) => i.id)).toEqual(items);
  });
  it("cannot rename or delete the view-only system category or modify local library data", () => {
    const file = workspace(); const categories = db.listCategories(); const poses = db.listPoses();
    db.updateCategory(UNCATEGORIZED_ID, "Rename"); db.deleteCategory(UNCATEGORIZED_ID);
    db.close(); db.init(file);
    expect(db.listCategories()).toEqual(categories); expect(db.listPoses()).toEqual(poses);
    expect(groupLibraryPoses(db.listPoses(), db.listCategories()).at(-1)?.category).toBe(null);
  });
});