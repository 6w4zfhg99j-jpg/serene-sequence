import type { Category, Pose, PracticeType, Subcategory } from "./yoga-api";
import { includesPractice, poseAssignment } from "./pose-assignment";

export const DEFAULT_CATEGORY_NAMES = [
  "INIZIO", "RISCALDAMENTO", "IN PIEDI", "EQUILIBRIO BRACCIA", "ALLUNGAMENTO",
  "FORZA", "TORSIONE", "DA SDRAIATI", "ESTENSIONE", "DA SDRAIATI ADDOMINALI", "CAPOVOLTE",
];

export function scopePracticeLibrary(poses: Pose[], categories: Category[], subcategories: Subcategory[], practice: PracticeType) {
  const scopedCategories = categories.filter((c) => (c.practice_type ?? "yoga") === practice);
  const ids = new Set(scopedCategories.map((c) => c.id));
  return {
    categories: scopedCategories,
    subcategories: subcategories.filter((s) => ids.has(s.category_id)),
    poses: poses.filter((p) => includesPractice(poseAssignment(p), practice))
      .map((p) => ({ ...p, categories: p.categories.filter((c) => ids.has(c.id)),
        subcategory_ids: p.subcategory_ids.filter((id) => subcategories.some((s) => s.id === id && ids.has(s.category_id))) })),
  };
}