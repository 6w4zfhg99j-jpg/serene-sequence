import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { initializeBrowserWorkspace, browserLocalBridge } from "./browser-local";
import { createBrowserStore } from "./browser-store";

vi.mock("@/integrations/supabase/client", () => {
  throw new Error("Cloud must never be imported for local startup");
});

describe("local first launch without reachable internet", () => {
  it("opens and allows saving when the browser reports online but every request fails", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const requests = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Disconnected"));
    await initializeBrowserWorkspace();
    expect((await browserLocalBridge.poses.list()).map((p) => p.name)).toEqual(["kikikasana", "suddassna"]);
    const id = await browserLocalBridge.sequences.create({ title: "No internet", practice_type: "stretching" });
    await browserLocalBridge.sequences.update(id, { practice_notes: "Local only" });
    const stored = await createBrowserStore().read();
    expect(stored?.sequences.find((s) => s.id === id)?.practice_notes).toBe("Local only");
    expect(requests).not.toHaveBeenCalled();
    requests.mockRestore(); vi.unstubAllGlobals();
  });
  it("never replaces saved local work on repeated startup", async () => {
    const first = await createBrowserStore().read();
    await initializeBrowserWorkspace();
    expect((await createBrowserStore().read())?.sequences).toEqual(first?.sequences);
    expect(first?.sequences[0]?.title).toBe("No internet");
  });
});