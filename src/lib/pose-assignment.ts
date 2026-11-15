import type { Category, Pose, PracticeType } from "./yoga-api";

export type PoseAssignment = PracticeType | "both";

export function includesPractice(assignment: PoseAssignment, practice: PracticeType) {
  return assignment === "both" || assignment === practice;
}

/** Legacy Yoga stays Yoga, including old automatically copied category links. */
export function legacyAssignment(categories: Category[]): PoseAssignment {
  return categories.length > 0 && categories.every((c) => c.practice_type === "stretching") ? "stretching" : "yoga";
}

export function poseAssignment(pose: Pick<Pose, "practice_assignment" | "categories">): PoseAssignment {
  return pose.practice_assignment ?? legacyAssignment(pose.categories);
}