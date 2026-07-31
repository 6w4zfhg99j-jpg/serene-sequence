import { Check } from "lucide-react";

import { LANGUAGES, useI18n } from "@/lib/i18n";

/**
 * Interface language picker. The choice is stored locally (localStorage), so it
 * works identically in the browser preview and the offline desktop build.
 */
export function LanguageSettings() {
  const { lang, setLang, t } = useI18n();

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-serif text-2xl">{t("settings.language")}</h2>
      </div>
      <p className="mb-3 text-sm text-ink-muted">{t("settings.languageHint")}</p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {LANGUAGES.map((l) => {
          const active = l.code === lang;
          return (
            <li key={l.code}>
              <button
                type="button"
                onClick={() => setLang(l.code)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-background"
              >
                <span className="flex items-baseline gap-2">
                  <span className={active ? "text-ink" : "text-ink-muted"}>
                    {l.label}
                  </span>
                  <span className="text-xs text-ink-subtle">{l.english}</span>
                </span>
                {active && <Check className="size-4" strokeWidth={1.5} />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
