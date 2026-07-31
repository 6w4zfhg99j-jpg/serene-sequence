import { Link, useRouterState } from "@tanstack/react-router";

import { useT } from "@/lib/i18n";

const NAV = [
  { to: "/builder", key: "nav.createSequence" },
  { to: "/library", key: "nav.poseLibrary" },
  { to: "/", key: "nav.savedSequences" },
  { to: "/manage", key: "nav.settings" },
] as const;

export function AppNav() {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-serif text-2xl italic leading-none">VONA</span>
          <span className="label-eyebrow hidden sm:inline">{t("nav.tagline")}</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname === item.to ||
                  pathname.startsWith(item.to + "/") ||
                  (item.to === "/builder" && pathname.startsWith("/sequences/"));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (active
                    ? "bg-ink text-background"
                    : "text-ink-muted hover:bg-surface hover:text-ink")
                }
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
