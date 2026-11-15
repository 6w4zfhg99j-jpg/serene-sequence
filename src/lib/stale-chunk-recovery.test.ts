import { describe, expect, it } from "vitest";
import { isStaleChunkError } from "./stale-chunk-recovery";

describe("isStaleChunkError", () => {
  it("detects Safari's failed module import", () => {
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
  });
  it("detects Chrome's failed dynamic import", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
  });
  it("ignores ordinary errors", () => {
    expect(isStaleChunkError(new Error("Sequence not found"))).toBe(false);
  });
});
