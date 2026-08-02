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
    fr: "DÉBUT",
    es: "INICIO",
    de: "BEGINN",
  },
  RISCALDAMENTO: {
    it: "RISCALDAMENTO",
    en: "WARM-UP",
    uk: "РОЗМИНКА",
    fr: "ÉCHAUFFEMENT",
    es: "CALENTAMIENTO",
    de: "AUFWÄRMEN",
  },
  "IN PIEDI": {
    it: "IN PIEDI",
    en: "STANDING",
    uk: "СТОЯЧИ",
    fr: "DEBOUT",
    es: "DE PIE",
    de: "STEHEND",
  },
  "EQUILIBRIO BRACCIA": {
    it: "EQUILIBRIO BRACCIA",
    en: "ARM BALANCE",
    uk: "БАЛАНС НА РУКАХ",
    fr: "ÉQUILIBRE SUR LES BRAS",
    es: "EQUILIBRIO SOBRE BRAZOS",
    de: "ARMBALANCE",
  },
  ALLUNGAMENTO: {
    it: "ALLUNGAMENTO",
    en: "STRETCHING",
    uk: "РОЗТЯЖКА",
    fr: "ÉTIREMENT",
    es: "ESTIRAMIENTO",
    de: "DEHNUNG",
  },
  FORZA: {
    it: "FORZA",
    en: "STRENGTH",
    uk: "СИЛА",
    fr: "FORCE",
    es: "FUERZA",
    de: "KRAFT",
  },
  TORSIONE: {
    it: "TORSIONE",
    en: "TWIST",
    uk: "СКРУТКИ",
    fr: "TORSION",
    es: "TORSIÓN",
    de: "DREHUNG",
  },
  "DA SDRAIATI": {
    it: "DA SDRAIATI",
    en: "LYING DOWN",
    uk: "ЛЕЖАЧИ",
    fr: "ALLONGÉ",
    es: "TUMBADOS",
    de: "LIEGEND",
  },
  ESTENSIONE: {
    it: "ESTENSIONE",
    en: "BACKBEND",
    uk: "ПРОГИНИ",
    fr: "EXTENSION",
    es: "EXTENSIÓN",
    de: "RÜCKBEUGE",
  },
  "DA SDRAIATI ADDOMINALI": {
    it: "DA SDRAIATI ADDOMINALI",
    en: "LYING CORE",
    uk: "ЛЕЖАЧИ: ПРЕС",
    fr: "ABDOS AU SOL",
    es: "ABDOMINALES TUMBADOS",
    de: "BAUCH LIEGEND",
  },
  CAPOVOLTE: {
    it: "CAPOVOLTE",
    en: "INVERSIONS",
    uk: "ПЕРЕВЕРНУТІ",
    fr: "INVERSIONS",
    es: "INVERSIONES",
    de: "UMKEHRHALTUNGEN",
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
