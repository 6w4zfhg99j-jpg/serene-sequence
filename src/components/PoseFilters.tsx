import { useMemo, useState } from "react";
import type { Category, Pose, Tag } from "@/lib/yoga-api";
import { Input } from "@/components/ui/input";
import { Heart, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCategoryLabel } from "@/lib/i18n/categories";

interface FiltersState {
  search: string;
  categoryId: string | null;
  tagIds: string[];
  favoritesOnly: boolean;
}

export function usePoseFilters(poses: Pose[]) {
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    categoryId: null,
    tagIds: [],
    favoritesOnly: false,
  });

  const filtered = useMemo(() => {
    const s = filters.search.trim().toLowerCase();
    return poses.filter((p) => {
      if (filters.favoritesOnly && !p.is_favorite) return false;
      if (filters.categoryId && !p.categories.some((c) => c.id === filters.categoryId))
        return false;
      if (
        filters.tagIds.length &&
        !filters.tagIds.every((tid) => p.tags.some((t) => t.id === tid))
      )
        return false;
      if (s) {
        const hay = (
          p.name +
          " " +
          (p.sanskrit_name ?? "") +
          " " +
          (p.description ?? "")
        ).toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [poses, filters]);

  return { filters, setFilters, filtered };
}

interface PanelProps {
  categories: Category[];
  tags: Tag[];
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  compact?: boolean;
}

export function PoseFiltersPanel({
  categories,
  tags,
  filters,
  setFilters,
  compact,
}: PanelProps) {
  const t = useT();
  const catLabel = useCategoryLabel();
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <Input
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder={t("common.searchPoses")}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() =>
            setFilters({ ...filters, favoritesOnly: !filters.favoritesOnly })
          }
          className={
            "flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors " +
            (filters.favoritesOnly
              ? "border-accent bg-accent text-accent-foreground"
              : "border-line text-ink-muted hover:border-ink-muted")
          }
        >
          <Heart
            className={"size-3 " + (filters.favoritesOnly ? "fill-current" : "")}
            strokeWidth={2}
          />
          {t("common.favoritesOnly")}
        </button>
      </div>

      <div>
        <p className="label-eyebrow mb-2">{t("library.categories")}</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilters({ ...filters, categoryId: null })}
            className={
              "rounded-full border px-2.5 py-0.5 text-xs " +
              (!filters.categoryId
                ? "border-ink bg-ink text-background"
                : "border-line text-ink-muted hover:border-ink-muted")
            }
          >
            {t("common.all")}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setFilters({
                  ...filters,
                  categoryId: filters.categoryId === c.id ? null : c.id,
                })
              }
              className={
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                (filters.categoryId === c.id
                  ? "border-ink bg-ink text-background"
                  : "border-line text-ink-muted hover:border-ink-muted")
              }
            >
              {catLabel(c.name)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label-eyebrow mb-2">{t("library.tags")}</p>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = filters.tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() =>
                  setFilters({
                    ...filters,
                    tagIds: on
                      ? filters.tagIds.filter((x) => x !== t.id)
                      : [...filters.tagIds, t.id],
                  })
                }
                className={
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                  (on
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-line text-ink-muted hover:border-ink-muted")
                }
              >
                #{t.name}
              </button>
            );
          })}
          {tags.length === 0 && (
            <span className="text-xs text-ink-subtle">No tags yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
