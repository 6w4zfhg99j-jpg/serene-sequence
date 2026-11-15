import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { browserLocalBridge as bridge } from "./browser-local";
import { createBrowserStore, migratePoseAssignments, prepareLocalLibrary } from "./browser-store";
import { bundledLibrary } from "./bundled-library";
import { scopePracticeLibrary } from "./practice-library";
import type { PoseAssignment } from "./pose-assignment";

async function view(mode: "yoga" | "stretching") {
  return scopePracticeLibrary(await bridge.poses.list(), await bridge.categories.list(), await bridge.subcategories.list(), mode);
}
async function create(assignment: PoseAssignment) {
  return bridge.poses.upsert({ name: `Exercise ${assignment}`, practice_assignment: assignment, difficulty: "beginner", categoryIds: [], subcategoryIds: [], tagIds: [] });
}

describe("explicit exercise membership in local browser storage", () => {
  it("shows Yoga-only exercises only in Yoga even when uncategorized", async () => {
    const id = await create("yoga");
    expect((await view("yoga")).poses.some((p) => p.id === id)).toBe(true);
    expect((await view("stretching")).poses.some((p) => p.id === id)).toBe(false);
  });
  it("shows Stretching-only exercises only in Stretching even when uncategorized", async () => {
    const id = await create("stretching");
    expect((await view("yoga")).poses.some((p) => p.id === id)).toBe(false);
    expect((await view("stretching")).poses.some((p) => p.id === id)).toBe(true);
  });
  it("shows Both in both libraries as one unique pose record", async () => {
    const id = await create("both");
    expect((await view("yoga")).poses.filter((p) => p.id === id)).toHaveLength(1);
    expect((await view("stretching")).poses.filter((p) => p.id === id)).toHaveLength(1);
    expect((await bridge.poses.list()).filter((p) => p.id === id)).toHaveLength(1);
  });
  it("updates shared information and keeps saved sequence items after reassignment", async () => {
    const id = await create("both");
    const yoga = await bridge.sequences.create({ title: "Existing Yoga", practice_type: "yoga" });
    const stretching = await bridge.sequences.create({ title: "Existing Stretching", practice_type: "stretching" });
    await bridge.sequences.addPose(yoga, id); await bridge.sequences.addPose(stretching, id);
    const yogaItem = (await bridge.sequences.get(yoga)).items[0].id;
    await bridge.poses.upsert({ id, name: "Edited everywhere", description: "Updated shared description", practice_assignment: "yoga", difficulty: "beginner", categoryIds: [], subcategoryIds: [], tagIds: [] });
    expect((await view("stretching")).poses.some((p) => p.id === id)).toBe(false);
    for (const sequence of [yoga, stretching]) {
      const saved = await bridge.sequences.get(sequence);
      expect(saved.items.map((p) => p.pose_id)).toEqual([id]);
      expect(saved.items[0].pose.name).toBe("Edited everywhere");
      expect(saved.items[0].pose.description).toBe("Updated shared description");
    }
    expect((await bridge.sequences.get(yoga)).items[0].id).toBe(yogaItem);
  });
  it("keeps independent categories and assignments when membership changes", async () => {
    const yoga = await bridge.categories.create("Yoga independent", "yoga");
    const stretching = await bridge.categories.create("Mobility independent", "stretching");
    const sub = await bridge.subcategories.create(stretching.id, "Shoulders");
    const id = await bridge.poses.upsert({ name: "Categorized", practice_assignment: "both", difficulty: "beginner", categoryIds: [yoga.id, stretching.id], subcategoryIds: [sub.id], tagIds: [] });
    await bridge.poses.upsert({ id, name: "Categorized", practice_assignment: "yoga", difficulty: "beginner", categoryIds: [yoga.id, stretching.id], subcategoryIds: [sub.id], tagIds: [] });
    expect((await view("yoga")).poses.find((p) => p.id === id)?.categories.map((c) => c.id)).toEqual([yoga.id]);
    expect((await view("stretching")).poses.some((p) => p.id === id)).toBe(false);
    expect((await bridge.poses.list()).find((p) => p.id === id)?.subcategory_ids).toEqual([sub.id]);
    expect((await bridge.categories.list()).find((c) => c.id === stretching.id)?.name).toBe("Mobility independent");
    expect((await bridge.categories.list()).find((c) => c.id === stretching.id)?.pose_count).toBe(0);
    expect((await bridge.subcategories.list()).find((s) => s.id === sub.id)?.pose_count).toBe(0);
  });
  it("persists assignment changes offline beyond query caches", async () => {
    const requests = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));
    const id = await create("stretching");
    const reopened = await createBrowserStore().read();
    expect(reopened?.poses.find((p) => p.id === id)?.practice_assignment).toBe("stretching");
    expect(requests).not.toHaveBeenCalled(); requests.mockRestore();
  });
});

describe("non-destructive assignment upgrades", () => {
  it("never automatically shares bundled Yoga poses on first launch", async () => {
    const state = prepareLocalLibrary(await bundledLibrary());
    expect(scopePracticeLibrary(state.poses, state.categories, state.subcategories, "stretching").poses).toEqual([]);
    expect(state.poses.map((p) => p.practice_assignment)).toEqual(["yoga", "yoga"]);
  });
  it("preserves all legacy rows and links without treating historical Yoga copies as Both", async () => {
    const state = prepareLocalLibrary(await bundledLibrary());
    const yoga = state.poses[0]; delete yoga.practice_assignment;
    const stretching = state.categories.find((c) => c.practice_type === "stretching");
    if (!stretching) throw new Error("Missing category");
    yoga.categories.push(stretching);
    state.poses[1].categories = [stretching]; delete state.poses[1].practice_assignment;
    const ids = state.poses.map((p) => p.id); const links = structuredClone(yoga.categories);
    migratePoseAssignments(state);
    expect(state.poses.map((p) => p.id)).toEqual(ids);
    expect(state.poses[0].practice_assignment).toBe("yoga");
    expect(state.poses[1].practice_assignment).toBe("stretching");
    expect(state.poses[0].categories).toEqual(links);
  });
});