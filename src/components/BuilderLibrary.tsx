import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Heart, Search } from "lucide-react";
import type { Category, Pose } from "@/lib/yoga-api";
import { PoseImage } from "./PoseImage";
import { Input } from "@/components/ui/input";

const LS_KEY = "builder.categoryCollapse.v1";
const OTHER = "__other__";

interface Props {
  poses: Pose[];
  categories: Category[];
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

export function BuilderLibrary({ poses, categories, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapse);
  const [pulsed, setPulsed] = useState<string | null>(null);

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
            placeholder="Search poses..."
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
          title="Favorites only"
        >
          <Heart className={"size-3 " + (favOnly ? "fill-current" : "")} strokeWidth={2} />
        </button>
      </div>

      <div className="-mr-1 flex-1 overflow-y-auto pr-1">
        {grouped.length === 0 && (
          <p className="p-4 text-center text-xs text-ink-subtle">No poses match.</p>
        )}
        {grouped.map((g) => {
          const id = g.cat?.id ?? OTHER;
          const isCollapsed = !!collapsed[id];
          const label = g.cat?.name ?? "Other";
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
                <span className="text-xs text-ink-subtle">{g.poses.length}</span>
              </button>
              {!isCollapsed && (
                <div className="mb-2 mt-1 grid grid-cols-2 gap-1.5 pl-2">
                  {g.poses.map((p) => (
                    <button
                      key={id + "-" + p.id}
                      type="button"
                      onClick={() => handleAdd(p)}
                      className={
                        "group flex items-center gap-2 overflow-hidden rounded-md border border-line bg-background p-1.5 text-left transition-all hover:border-ink-subtle hover:shadow-sm active:scale-[0.98] " +
                        (pulsed === p.id ? "ring-2 ring-accent" : "")
                      }
                      title="Click to add"
                    >
                      <PoseImage
                        path={p.image_url}
                        alt={p.name}
                        className="size-10 shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium leading-tight">
                          {p.name}
                        </p>
                        {p.sanskrit_name && (
                          <p className="truncate text-[10px] italic text-ink-subtle">
                            {p.sanskrit_name}
                          </p>
                        )}
                      </div>
                      {p.is_favorite && (
                        <Heart
                          className="size-3 shrink-0 fill-accent text-accent"
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
