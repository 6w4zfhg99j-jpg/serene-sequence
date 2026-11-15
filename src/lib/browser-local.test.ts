import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { browserLocalBridge as bridge } from "./browser-local";
import { createBrowserStore } from "./browser-store";

beforeAll(() => vi.stubGlobal("navigator", { onLine: false }));

describe("account-free sequence workflow", () => {
  it("creates, saves, reopens and edits Stretching locally without a cloud request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network disconnected"));
    const id = await bridge.sequences.create({ title: "Mobility", practice_type: "stretching" });
    const categories = await bridge.categories.list();
    const category = categories.find((c) => c.practice_type === "stretching");
    if (!category) throw new Error("Missing Stretching categories");
    const poseId = await bridge.poses.upsert({ name: "Hip stretch", difficulty: "beginner", categoryIds: [category.id], subcategoryIds: [], tagIds: [] });
    await bridge.sequences.addPose(id, poseId);
    await bridge.sequences.update(id, { practice_notes: "Slow breathing" });
    let reopened = await bridge.sequences.get(id);
    expect(reopened.practice_type).toBe("stretching");
    expect(reopened.items.map((it) => it.pose_id)).toEqual([poseId]);
    expect(reopened.practice_notes).toBe("Slow breathing");
    await bridge.sequences.updateItem(reopened.items[0].id, { notes: "Hold gently" });
    await bridge.sequences.update(id, { title: "Evening mobility" });
    reopened = await bridge.sequences.get(id);
    expect(reopened.title).toBe("Evening mobility");
    expect(reopened.items[0].notes).toBe("Hold gently");
    expect(reopened.practice_type).toBe("stretching");
    const copy = await bridge.sequences.get(await bridge.sequences.duplicate(id));
    expect(copy.practice_type).toBe("stretching");
    expect(copy.items[0].notes).toBe("Hold gently");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("opens the entire bundled pose library and images while disconnected", async () => {
    const poses = await bridge.poses.list();
    for (const name of ["kikikasana", "suddassna"]) {
      const pose = poses.find((p) => p.name === name);
      expect(pose?.image_url?.startsWith("data:image/")).toBe(true);
      expect(pose?.categories.map((c) => c.practice_type).sort()).toEqual(["stretching", "yoga"]);
    }
  });
  it("keeps Yoga as the default and preserves it through editing", async () => {
    const id = await bridge.sequences.create({ title: "Yoga" });
    await bridge.sequences.update(id, { title: "Morning Yoga" });
    expect((await bridge.sequences.get(id)).practice_type).toBe("yoga");
    expect((await bridge.sequences.list()).find((s) => s.id === id)?.title).toBe("Morning Yoga");
  });
  it("allows equal category names in separate modes without replacing Yoga categories", async () => {
    const yoga = await bridge.categories.create("Custom", "yoga");
    const stretching = await bridge.categories.create("Custom", "stretching");
    await bridge.categories.update(stretching.id, "Stretching only");
    const all = await bridge.categories.list();
    expect(yoga.id).not.toBe(stretching.id);
    expect(all.find((c) => c.id === yoga.id)?.name).toBe("Custom");
    expect(all.find((c) => c.id === stretching.id)?.name).toBe("Stretching only");
  });
  it("keeps shared Yoga assignments when a Stretching category is deleted", async () => {
    const yoga = await bridge.categories.create("Shared category", "yoga");
    const stretching = await bridge.categories.create("Shared category", "stretching");
    const sub = await bridge.subcategories.create(stretching.id, "Stretching subcategory");
    const id = await bridge.poses.upsert({ name: "Shared", difficulty: "beginner", categoryIds: [yoga.id, stretching.id], subcategoryIds: [sub.id], tagIds: [] });
    await bridge.categories.remove(stretching.id);
    const pose = (await bridge.poses.list()).find((p) => p.id === id);
    expect(pose?.categories.map((c) => c.id)).toEqual([yoga.id]);
    expect(pose?.subcategory_ids).toEqual([]);
  });
  it("purges deleted sequences after seven days without removing younger entries", async () => {
    const expired = await bridge.sequences.create({ title: "Expired" });
    const current = await bridge.sequences.create({ title: "Recent" });
    await bridge.sequences.remove(expired);
    await bridge.sequences.remove(current);
    const store = createBrowserStore();
    await store.change((s) => {
      const q = s.sequences.find((q) => q.id === expired);
      if (q) Object.assign(q, { deleted_at: new Date(Date.now() - 8 * 86400000).toISOString() });
    });
    const trash = await bridge.sequences.listTrash?.();
    expect(trash?.some((s) => s.id === expired)).toBe(false);
    expect(trash?.some((s) => s.id === current)).toBe(true);
    expect((await store.read())?.sequences.some((s) => s.id === expired)).toBe(false);
  });
});