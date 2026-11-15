import library from "../../electron/library.json";
import type { BrowserSnapshot } from "./browser-store";
import type { Pose } from "./yoga-api";

/** An immutable, locally bundled copy of the public library; never personal sequences. */
export function bundledLibrary(): BrowserSnapshot {
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