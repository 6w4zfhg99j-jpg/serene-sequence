import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Heart, Search } from "lucide-react";
import type { Category, Pose, Subcategory } from "@/lib/yoga-api";
import { PoseImage } from "./PoseImage";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { useCategoryLabel } from "@/lib/i18n/categories";

const LS_KEY = "builder.categoryCollapse.v1";
const COLS_KEY = "builder.cardsPerRow.v1";
const COL_OPTIONS = [4, 5, 6] as const;
const COL_CLASS: Record<number, string> = {
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

function loadCols(): number {
  if (typeof window === "undefined") return 5;
  const v = Number(localStorage.getItem(COLS_KEY));
  return COL_OPTIONS.includes(v as (typeof COL_OPTIONS)[number]) ? v : 5;
}
const OTHER = "__other__";

interface Props {
  poses: Pose[];
  categories: Category[];
  subcategories?: Subcategory[];
  onAdd: (pose: Pose) => void;
}

function loadCollapse(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function BuilderLibrary({ poses, categories, subcategories = [], onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapse);
  const [activeSub, setActiveSub] = useState<Record<string, string | null>>({});
  const [pulsed, setPulsed] = useState<string | null>(null);
  const [cols, setCols] = useState<number>(loadCols);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(COLS_KEY, String(cols));
  }, [cols]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, JSON.stringify(collapsed));
    }
  }, [collapsed]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return poses.filter((p) => {
      if (favOnly && !p.is_favorite) return false;
      if (!s) return true;
      const hay = (p.name + " " + (p.sanskrit_name ?? "")).toLowerCase();
      return hay.includes(s);
    });
  }, [poses, search, favOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, { cat: Category | null; poses: Pose[] }>();
    for (const c of categories) map.set(c.id, { cat: c, poses: [] });
    map.set(OTHER, { cat: null, poses: [] });
    for (const p of filtered) {
      if (p.categories.length === 0) {
        map.get(OTHER)!.poses.push(p);
      } else {
        for (const c of p.categories) {
          if (!map.has(c.id)) map.set(c.id, { cat: c, poses: [] });
          map.get(c.id)!.poses.push(p);
        }
      }
    }
    return Array.from(map.values()).filter((g) => g.poses.length > 0);
  }, [filtered, categories]);

  const t = useT();
  const catLabel = useCategoryLabel();

  function toggle(id: string) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  }

  function handleAdd(p: Pose) {
    onAdd(p);
    setPulsed(p.id);
    window.setTimeout(() => setPulsed((cur) => (cur === p.id ? null : cur)), 400);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.searchPoses")}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setFavOnly((v) => !v)}
          className={
            "flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors " +
            (favOnly
              ? "border-accent bg-accent text-accent-foreground"
              : "border-line text-ink-muted hover:border-ink-muted")
          }
          title={t("common.favoritesOnly")}
        >
          <Heart className={"size-3 " + (favOnly ? "fill-current" : "")} strokeWidth={2} />
        </button>
        <div className="flex h-8 items-center gap-0.5 rounded-md border border-line px-1">
          {COL_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCols(n)}
              title={`${n} per row`}
              className={
                "rounded px-1.5 py-0.5 text-[11px] transition-colors " +
                (cols === n
                  ? "bg-ink text-background"
                  : "text-ink-muted hover:text-ink")
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="-mr-1 flex-1 overflow-y-auto pr-1">
        {grouped.length === 0 && (
          <p className="p-4 text-center text-xs text-ink-subtle">{t("library.noMatchTitle")}</p>
        )}
        {grouped.map((g) => {
          const id = g.cat?.id ?? OTHER;
          const isCollapsed = !!collapsed[id];
          const label = g.cat ? catLabel(g.cat.name) : t("common.other");
          const subs = subcategories
            .filter((s) => s.category_id === id)
            .sort((a, b) => a.sort_order - b.sort_order);
          const sel = activeSub[id] ?? null;
          const visiblePoses = sel
            ? g.poses.filter((p) => p.subcategory_ids.includes(sel))
            : g.poses;
          return (
            <div key={id} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-background"
              >
                <ChevronRight
                  className={
                    "size-3.5 text-ink-subtle transition-transform " +
                    (isCollapsed ? "" : "rotate-90")
                  }
                  strokeWidth={2}
                />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-ink-subtle">{visiblePoses.length}</span>
              </button>
              {!isCollapsed && subs.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 pl-6">
                  <button
                    type="button"
                    onClick={() => setActiveSub((m) => ({ ...m, [id]: null }))}
                    className={
                      "rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
                      (sel === null
                        ? "border-ink bg-ink text-background"
                        : "border-line text-ink-muted hover:border-ink-muted")
                    }
                  >
                    {t("common.all")}
                  </button>
                  {subs.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setActiveSub((m) => ({ ...m, [id]: sel === s.id ? null : s.id }))
                      }
                      className={
                        "rounded-full border px-2 py-0.5 text-[11px] transition-colors " +
                        (sel === s.id
                          ? "border-ink bg-ink text-background"
                          : "border-line text-ink-muted hover:border-ink-muted")
                      }
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {!isCollapsed && (
                <div className={"mb-2 mt-1 grid gap-1.5 pl-2 " + COL_CLASS[cols]}>
                  {visiblePoses.map((p) => (
                    <button
                      key={id + "-" + p.id}
                      type="button"
                      onClick={() => handleAdd(p)}
                      className={
                        "group relative flex flex-col overflow-hidden rounded-md border border-line bg-background p-1 text-center transition-all hover:border-ink-subtle hover:shadow-sm active:scale-[0.98] " +
                        (pulsed === p.id ? "ring-2 ring-accent" : "")
                      }
                      title={t("common.clickToAdd")}
                    >
                      <PoseImage
                        path={p.image_url}
                        alt={p.name}
                        className="aspect-square w-full rounded object-cover"
                      />
                      <p className="mt-1 line-clamp-2 px-0.5 text-[11px] font-medium leading-tight">
                        {p.name}
                      </p>
                      {p.is_favorite && (
                        <Heart
                          className="absolute right-1 top-1 size-3 fill-accent text-accent drop-shadow"
                          strokeWidth={2}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
