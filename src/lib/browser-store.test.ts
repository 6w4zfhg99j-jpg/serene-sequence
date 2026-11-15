import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createBrowserStore, prepareLocalLibrary, type BrowserSnapshot } from "./browser-store";
import { scopePracticeLibrary } from "./practice-library";
import type { Pose } from "./yoga-api";

const yoga = { id: "yoga-cat", name: "ALLUNGAMENTO", sort_order: 0 };
const pose: Pose = { id: "pose", name: "Shared pose", sanskrit_name: null, description: "**Keep** this note", duration_seconds: null,
  difficulty: "beginner", image_url: "data:image/png;base64,test", is_favorite: true, created_at: "2026-11-15", updated_at: "2026-11-15",
  subcategory_id: "sub", subcategory_ids: ["sub"], sort_order: 0, categories: [yoga], tags: [] };
const snapshot = (): BrowserSnapshot => ({ categories: [yoga], subcategories: [{ id: "sub", name: "Hips", category_id: yoga.id, sort_order: 0 }], poses: [pose], sequences: [], tags: [], folders: [] });

describe("separate practice organization", () => {
  it("copies every category and subcategory to Stretching without duplicating poses", () => {
    const state = prepareLocalLibrary(snapshot());
    expect(state.categories.map((c) => c.practice_type)).toEqual(["yoga", "stretching"]);
    expect(state.subcategories.map((s) => s.category_id)).toEqual(["yoga-cat", "stretching:yoga-cat"]);
    expect(state.poses.map((p) => p.id)).toEqual(["pose"]);
    expect(state.poses[0].subcategory_ids).toEqual(["sub", "stretching:sub"]);
  });
  it("preserves existing Yoga data and repeats initialization without extra copies", () => {
    const state = prepareLocalLibrary(snapshot());
    const twice = prepareLocalLibrary(state);
    expect(twice).toEqual(state);
    expect(snapshot().poses[0]).toEqual(pose);
    expect(state.poses[0].description).toBe("**Keep** this note");
    expect(state.poses[0].image_url).toBe("data:image/png;base64,test");
  });
  it("keeps Stretching category edits independent while sharing pose identities", () => {
    const state = prepareLocalLibrary(snapshot());
    state.categories[1].name = "Mobility";
    const stretching = scopePracticeLibrary(state.poses, state.categories, state.subcategories, "stretching");
    const yogaView = scopePracticeLibrary(state.poses, state.categories, state.subcategories, "yoga");
    expect(stretching.categories.map((c) => c.name)).toEqual(["Mobility"]);
    expect(yogaView.categories.map((c) => c.name)).toEqual(["ALLUNGAMENTO"]);
    expect(stretching.poses.map((p) => p.id)).toEqual(yogaView.poses.map((p) => p.id));
    expect(stretching.poses[0].categories.map((c) => c.id)).toEqual(["stretching:yoga-cat"]);
  });
  it("makes all eleven default sections available in both modes, even without poses", () => {
    const state = prepareLocalLibrary({ ...snapshot(), categories: [], subcategories: [], poses: [] });
    expect(state.categories.filter((c) => c.practice_type === "yoga")).toHaveLength(11);
    expect(state.categories.filter((c) => c.practice_type === "stretching")).toHaveLength(11);
  });
});

it("persists browser edits across reopening and does not overwrite local work on reinitialization", async () => {
  const name = `test-${crypto.randomUUID()}`;
  const store = createBrowserStore(name);
  await store.initialize(snapshot());
  await store.change((s) => { s.poses[0].name = "Edited locally"; });
  const reopened = createBrowserStore(name);
  await reopened.initialize(snapshot());
  expect((await reopened.read())?.poses[0].name).toBe("Edited locally");
});

it("serializes concurrent writes so multiple additions are never lost", async () => {
  const store = createBrowserStore(`test-${crypto.randomUUID()}`);
  await store.initialize(snapshot());
  await Promise.all(Array.from({ length: 10 }, (_, i) => store.change((s) => s.tags.push({ id: String(i), name: String(i) }))));
  expect((await store.read())?.tags).toHaveLength(10);
});