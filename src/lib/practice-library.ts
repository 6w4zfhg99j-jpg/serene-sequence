import type { Category, Pose, PracticeType, Subcategory } from "./yoga-api";

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
    poses: poses.filter((p) => p.categories.length === 0 || p.categories.some((c) => ids.has(c.id)))
      .map((p) => ({ ...p, categories: p.categories.filter((c) => ids.has(c.id)) })),
  };
}