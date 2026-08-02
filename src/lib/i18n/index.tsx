import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { en, type Dict } from "./locales/en";
import { it } from "./locales/it";
import { uk } from "./locales/uk";
import { fr } from "./locales/fr";
import { es } from "./locales/es";
import { de } from "./locales/de";

export type LangCode = "en" | "it" | "uk" | "fr" | "es" | "de";
export type TKey = keyof Dict;

const CATALOGS: Record<LangCode, Dict> = { en, it, uk, fr, es, de };

export const LANGUAGES: { code: LangCode; label: string; english: string }[] = [
  { code: "en", label: "English", english: "English" },
  { code: "it", label: "Italiano", english: "Italian" },
  { code: "uk", label: "Українська", english: "Ukrainian" },
  { code: "fr", label: "Français", english: "French" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "de", label: "Deutsch", english: "German" },
];

const STORAGE_KEY = "vona.language.v1";

function readStored(): LangCode | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && v in CATALOGS ? (v as LangCode) : null;
}

interface I18nValue {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  /** Translate a key; `{name}` placeholders are replaced from `vars`. */
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start from `en` so SSR and the first client render match; the stored
  // preference is applied right after hydration.
  const [lang, setLangState] = useState<LangCode>("en");

  useEffect(() => {
    const stored = readStored();
    if (stored) setLangState(stored);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable — keep in-memory only */
    }
  }, []);

  const t = useCallback<I18nValue["t"]>(
    (key, vars) => {
      const dict = CATALOGS[lang] ?? en;
      let out = dict[key] ?? en[key] ?? String(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.replaceAll(`{${k}}`, String(v));
        }
      }
      return out;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Shorthand for components that only need the translate function. */
export function useT() {
  return useI18n().t;
}
