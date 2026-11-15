import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { browserLocalBridge as bridge } from "./browser-local";
import { createBrowserStore } from "./browser-store";
import { groupLibraryPoses, isUncategorized, matchesPoseCategory, UNCATEGORIZED_ID } from "./pose-categories";
import { scopePracticeLibrary } from "./practice-library";
import type { BrowserSnapshot } from "./browser-store";
import type { Category, Pose, PracticeType } from "./yoga-api";

const yoga: Category = { id: "yoga-category", name: "INIZIO", sort_order: 8, practice_type: "yoga" };
const stretching: Category = { id: "stretch-category", name: "RISCALDAMENTO", sort_order: 2, practice_type: "stretching" };
function pose(categories: Category[] = [], assignment: "yoga" | "stretching" | "both" = "yoga"): Pose {
  return { id: "existing-pose", name: "Existing exercise", practice_assignment: assignment, categories,
    sanskrit_name: null, description: null, duration_seconds: null, difficulty: "beginner", image_url: null,
    is_favorite: false, created_at: "2026-01-01", updated_at: "2026-01-01", subcategory_id: null,
    subcategory_ids: [], sort_order: 0, tags: [] };
}
function unassigned(state: BrowserSnapshot, mode: PracticeType = "yoga") {
  const scoped = scopePracticeLibrary(state.poses, state.categories, state.subcategories, mode);
  return groupLibraryPoses(scoped.poses, scoped.categories).find((g) => !g.category)?.poses.map((p) => p.id);
}
async function snapshot() {
  const state = await createBrowserStore().read();
  if (!state) throw new Error("Missing workspace");
  return state;
}
const input = { name: "Unassigned exercise", difficulty: "beginner" as const, practice_assignment: "yoga" as const,
  categoryIds: [] as string[], subcategoryIds: [], tagIds: [] };

describe("computed Uncategorized system category", () => {
  it("includes existing poses with no category without modifying their records", () => {
    const existing = pose(); const before = structuredClone(existing);
    expect(groupLibraryPoses([existing], [yoga]).find((g) => !g.category)?.poses).toEqual([existing]);
    expect(existing).toEqual(before);
  });
  it("excludes any pose assigned to one or more categories", () => {
    expect(isUncategorized(pose([yoga]))).toBe(false);
    expect(matchesPoseCategory(pose([yoga, stretching]), UNCATEGORIZED_ID)).toBe(false);
  });
  it("keeps Uncategorized last even when empty, after manually ordered categories", () => {
    const groups = groupLibraryPoses([], [yoga, stretching]);
    expect(groups.map((g) => g.category?.id ?? UNCATEGORIZED_ID)).toEqual([stretching.id, yoga.id, UNCATEGORIZED_ID]);
    expect(groups[2].poses).toEqual([]);
  });
  it("filters to only Uncategorized when that system section is selected", () => {
    const categorized = { ...pose([yoga]), id: "categorized" };
    expect([pose(), categorized].filter((p) => matchesPoseCategory(p, UNCATEGORIZED_ID)).map((p) => p.id)).toEqual(["existing-pose"]);
  });
  it.each(["yoga", "stretching"] as const)("respects exercise membership in the %s system section", (mode) => {
    const poses = [pose([], "yoga"), { ...pose([], "stretching"), id: "stretch-only" }, { ...pose([], "both"), id: "shared" }];
    const scoped = scopePracticeLibrary(poses, [yoga, stretching], [], mode);
    expect(scoped.poses.filter(isUncategorized).map((p) => p.id)).toEqual(mode === "yoga" ? ["existing-pose", "shared"] : ["stretch-only", "shared"]);
  });
  it.each(["yoga", "stretching"] as const)("does not treat a category in the other mode as uncategorized in %s", (mode) => {
    const shared = pose([mode === "yoga" ? stretching : yoga], "both");
    const scoped = scopePracticeLibrary([shared], [yoga, stretching], [], mode);
    expect(scoped.poses[0].categories).toEqual([]);
    expect(scoped.poses.filter((p) => matchesPoseCategory(p, UNCATEGORIZED_ID))).toEqual([]);
  });
});

describe("persistent local automatic categorization", () => {
  it("places newly saved poses without categories in Uncategorized after reopening IndexedDB", async () => {
    const id = await bridge.poses.upsert(input);
    expect(unassigned(await snapshot())).toContain(id);
  });
  it("automatically removes a pose when a category is assigned, without duplicating it", async () => {
    const id = await bridge.poses.upsert(input);
    const category = (await bridge.categories.list())[0];
    await bridge.poses.upsert({ ...input, id, categoryIds: [category.id] });
    const state = await snapshot();
    expect(unassigned(state)).not.toContain(id);
    expect(state.poses.filter((p) => p.id === id)).toHaveLength(1);
  });
  it("automatically returns a pose after its last category is removed and preserves saved sequences", async () => {
    const category = (await bridge.categories.list())[0];
    const id = await bridge.poses.upsert({ ...input, categoryIds: [category.id] });
    const sequence = await bridge.sequences.create({ title: "Preserved sequence" });
    await bridge.sequences.addPose(sequence, id);
    await bridge.poses.upsert({ ...input, id });
    expect(unassigned(await snapshot())).toContain(id);
    expect((await bridge.sequences.get(sequence)).items.map((item) => item.pose_id)).toEqual([id]);
  });
  it("does not classify a pose as Uncategorized until all categories are removed", async () => {
    const categories = await bridge.categories.list();
    const id = await bridge.poses.upsert({ ...input, categoryIds: categories.slice(0, 2).map((c) => c.id) });
    await bridge.poses.upsert({ ...input, id, categoryIds: [categories[0].id] });
    expect(unassigned(await snapshot())).not.toContain(id);
  });
  it("automatically includes a pose when its last category is deleted", async () => {
    const category = await bridge.categories.create("Temporary category");
    const id = await bridge.poses.upsert({ ...input, categoryIds: [category.id] });
    await bridge.categories.remove(category.id);
    expect(unassigned(await snapshot())).toContain(id);
  });
  it("cannot rename or delete the computed system category and leaves existing data untouched", async () => {
    await bridge.poses.list();
    const before = await snapshot();
    await bridge.categories.update(UNCATEGORIZED_ID, "Renamed");
    await bridge.categories.remove(UNCATEGORIZED_ID);
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(after.categories.some((c) => c.id === UNCATEGORIZED_ID)).toBe(false);
    expect(groupLibraryPoses(after.poses, after.categories).at(-1)?.category).toBe(null);
  });
});