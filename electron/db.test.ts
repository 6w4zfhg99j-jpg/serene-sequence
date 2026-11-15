import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const db = require("./db.cjs");
const Database = require("better-sqlite3");

describe("existing desktop data upgrade", () => {
  it("separates categories and preserves existing Yoga poses, then reopens an edited Stretching sequence", () => {
    const path = join(mkdtempSync(join(tmpdir(), "vona-test-")), "vona.db");
    db.init(path);
    const yoga = db.listCategories().filter((c: any) => c.practice_type === "yoga");
    expect(yoga).toHaveLength(11);
    const sub = db.createSubcategory(yoga[0].id, "Original subcategory");
    const poseId = db.upsertPose({ name: "Existing pose", difficulty: "beginner", description: "**Bold note**", image_url: "local://test.jpg", categoryIds: [yoga[0].id], subcategoryIds: [sub.id], tagIds: [] });
    // Reproduce a pre-upgrade workspace with existing data.
    const raw = new Database(path);
    raw.prepare("DELETE FROM categories WHERE practice_type = 'stretching'").run();
    raw.prepare("DELETE FROM app_meta WHERE key = 'stretching_categories_v1'").run();
    raw.close();
    db.init(path);
    const stretching = db.listCategories().filter((c: any) => c.practice_type === "stretching");
    expect(stretching).toHaveLength(11);
    const poses = db.listPoses();
    expect(poses.map((p: any) => p.id)).toEqual([poseId]);
    expect(poses[0].categories.map((c: any) => c.practice_type).sort()).toEqual(["stretching", "yoga"]);
    expect(poses[0].subcategory_ids).toHaveLength(2);
    expect(poses[0].description).toBe("**Bold note**");
    expect(poses[0].image_url).toBe("local://test.jpg");
    const id = db.createSequence({ title: "Stretching", practice_type: "stretching" });
    db.addPoseToSequence(id, poseId);
    db.updateSequence(id, { title: "Edited Stretching", practice_notes: "Relax" });
    db.init(path);
    expect(db.getSequence(id).practice_type).toBe("stretching");
    expect(db.getSequence(id).title).toBe("Edited Stretching");
    expect(db.getSequence(id).items[0].pose_id).toBe(poseId);
    expect(db.getSequence(db.duplicateSequence(id)).practice_type).toBe("stretching");
    expect(db.listCategories()).toHaveLength(22);
    expect(db.getSequence(db.createSequence({ title: "Yoga" })).practice_type).toBe("yoga");
  });
});