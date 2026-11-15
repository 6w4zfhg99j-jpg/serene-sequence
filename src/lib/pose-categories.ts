import type { Category, Pose } from "./yoga-api";

/** View-only identity: never persist this as a category or pose relationship. */
export const UNCATEGORIZED_ID = "__vona_system_uncategorized__";

export function isUncategorized(pose: Pose): boolean {
  return pose.is_uncategorized ?? pose.categories.length === 0;
}

export function matchesPoseCategory(pose: Pose, categoryId: string | null): boolean {
  if (!categoryId) return true;
  if (categoryId === UNCATEGORIZED_ID) return isUncategorized(pose);
  return pose.categories.some((category) => category.id === categoryId);
}

export interface LibraryPoseGroup {
  category: Category | null;
  poses: Pose[];
}

/** Uncategorized is a computed system section, always after editable categories. */
export function groupLibraryPoses(poses: Pose[], categories: Category[]): LibraryPoseGroup[] {
  return [
    ...[...categories].sort((a, b) => a.sort_order - b.sort_order).map((category) => ({
      category,
      poses: poses.filter((pose) => matchesPoseCategory(pose, category.id)),
    })),
    { category: null, poses: poses.filter(isUncategorized) },
  ];
}