import libraryUrl from "../../electron/library.json?url";
import type { BrowserSnapshot } from "./browser-store";
import type { Pose } from "./yoga-api";

type LibraryFile = typeof import("../../electron/library.json");

/**
 * Loads the bundled library file on demand (first launch only). It is fetched as a plain
 * local file instead of being imported as code, because a multi-megabyte module makes
 * Safari fail every page load with "Importing a module script failed".
 */
async function loadLibraryFile(): Promise<LibraryFile> {
  if (typeof window !== "undefined" && typeof fetch === "function") {
    try {
      const response = await fetch(libraryUrl);
      if (response.ok) return (await response.json()) as LibraryFile;
    } catch {
      // fall through to the module import (tests, unusual runtimes)
    }
  }
  return (await import("../../electron/library.json")).default as LibraryFile;
}

/** An immutable, locally bundled copy of the public library; never personal sequences. */
export async function bundledLibrary(): Promise<BrowserSnapshot> {
  const library = await loadLibraryFile();
  const categories = library.categories.map((c) => ({ ...c, practice_type: "yoga" as const }));
  const poses: Pose[] = library.poses.map((p) => ({
    ...p,
    practice_assignment: "yoga",
    difficulty: p.difficulty as Pose["difficulty"],
    categories: categories.filter((c) => library.pose_categories.some((link) => link.pose_id === p.id && link.category_id === c.id)),
    subcategory_ids: [...new Set([
      ...library.pose_subcategories.filter((link) => link.pose_id === p.id).map((link) => link.subcategory_id),
      ...(p.subcategory_id ? [p.subcategory_id] : []),
    ])],
    tags: library.tags.filter((tag) => library.pose_tags.some((link: { pose_id: string; tag_id: string }) => link.pose_id === p.id && link.tag_id === tag.id)),
  }));
  return structuredClone({ categories, poses, subcategories: library.subcategories, tags: library.tags, folders: [], sequences: [] });
}