/**
 * Default pose categories.
 *
 * The canonical (Italian) name is what gets stored in the database, so a
 * category's identity never depends on the interface language. The UI looks the
 * stored name up in this table and renders the label for the active language;
 * anything not found here (a category the user created or renamed) is shown
 * exactly as stored.
 */
import { useI18n, type LangCode } from "./index";

export type CategoryLabels = Record<LangCode, string>;

/** Canonical names, in the order they are seeded. */
export const DEFAULT_CATEGORIES = [
  "INIZIO",
  "RISCALDAMENTO",
  "IN PIEDI",
  "EQUILIBRIO BRACCIA",
  "ALLUNGAMENTO",
  "FORZA",
  "TORSIONE",
  "DA SDRAIATI",
  "ESTENSIONE",
  "DA SDRAIATI ADDOMINALI",
  "CAPOVOLTE",
] as const;

export const CATEGORY_LABELS: Record<string, CategoryLabels> = {
  INIZIO: {
    it: "INIZIO",
    en: "START",
    uk: "ПОЧАТОК",
  },
  RISCALDAMENTO: {
    it: "RISCALDAMENTO",
    en: "WARM-UP",
    uk: "РОЗМИНКА",
  },
  "IN PIEDI": {
    it: "IN PIEDI",
    en: "STANDING",
    uk: "СТОЯЧИ",
  },
  "EQUILIBRIO BRACCIA": {
    it: "EQUILIBRIO BRACCIA",
    en: "ARM BALANCE",
    uk: "БАЛАНС НА РУКАХ",
  },
  ALLUNGAMENTO: {
    it: "ALLUNGAMENTO",
    en: "STRETCHING",
    uk: "РОЗТЯЖКА",
  },
  FORZA: {
    it: "FORZA",
    en: "STRENGTH",
    uk: "СИЛА",
  },
  TORSIONE: {
    it: "TORSIONE",
    en: "TWIST",
    uk: "СКРУТКИ",
  },
  "DA SDRAIATI": {
    it: "DA SDRAIATI",
    en: "LYING DOWN",
    uk: "ЛЕЖАЧИ",
  },
  ESTENSIONE: {
    it: "ESTENSIONE",
    en: "BACKBEND",
    uk: "ПРОГИНИ",
  },
  "DA SDRAIATI ADDOMINALI": {
    it: "DA SDRAIATI ADDOMINALI",
    en: "LYING CORE",
    uk: "ЛЕЖАЧИ: ПРЕС",
  },
  CAPOVOLTE: {
    it: "CAPOVOLTE",
    en: "INVERSIONS",
    uk: "ПЕРЕВЕРНУТІ",
  },
};

/** Translate a stored category name; unknown (custom) names pass through. */
export function categoryLabel(name: string, lang: LangCode): string {
  const entry = CATEGORY_LABELS[name.trim().toUpperCase()];
  return entry ? (entry[lang] ?? entry.en) : name;
}

/** Hook version bound to the active interface language. */
export function useCategoryLabel(): (name: string | null | undefined) => string {
  const { lang } = useI18n();
  return (name) => (name ? categoryLabel(name, lang) : "");
}
