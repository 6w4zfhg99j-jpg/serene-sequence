import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { PracticeToggle } from "@/components/PracticeToggle";
import { usePractice } from "@/lib/practice-context";
import { scopePracticeLibrary } from "@/lib/practice-library";
import { groupLibraryPoses } from "@/lib/pose-categories";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  createSequence,
  addPoseToSequence,
  purgeSequence,
  fetchCategories,
  fetchPoses,
  fetchSubcategories,
  fetchTags,
  reorderPoses,
  toggleFavorite,
  type Category,
  type Pose,
  type Subcategory,
} from "@/lib/yoga-api";
import { Button } from "@/components/ui/button";
import { PoseCard } from "@/components/PoseCard";
import { PoseFormDialog } from "@/components/PoseFormDialog";
import { PoseFiltersPanel, usePoseFilters } from "@/components/PoseFilters";
import { useT } from "@/lib/i18n";
import { useCategoryLabel } from "@/lib/i18n/categories";

interface SelectionProps {
  selectedIds: string[];
  onSelect: (pose: Pose) => void;
}

interface Group {
  category: Category | null;
  poses: Pose[];
}

/** A pose card that can be dragged to a new position within its section. */
function SortablePoseCard({
  pose,
  onEdit,
  onFavorite,
  selectedIds,
  onSelect,
}: SelectionProps & {
  pose: Pose;
  onEdit: (p: Pose) => void;
  onFavorite: (p: Pose) => void;
}) {
  const t = useT();
  const selected = selectedIds.includes(pose.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pose.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="relative touch-none"
      {...attributes}
      {...listeners}
    >
      <PoseCard
        pose={pose}
        dense
        onClick={() => onEdit(pose)}
        onFavorite={() => onFavorite(pose)}
      />
      <Button size="icon" variant={selected ? "default" : "outline"} className="absolute bottom-1 right-1 size-7"
        aria-label={`${selected ? t("common.remove") : t("common.addToSequence")} ${pose.name}`}
        aria-pressed={selected}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onSelect(pose); }}>
        {selected ? <Check className="size-3" /> : <Plus className="size-3" />}
      </Button>
    </div>
  );
}

function CategorySection({
  group,
  subcategories,
  onEdit,
  onFavorite,
  onReorder,
  selectedIds,
  onSelect,
}: SelectionProps & {
  group: Group;
  subcategories: Subcategory[];
  onEdit: (p: Pose) => void;
  onFavorite: (p: Pose) => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const t = useT();
  const catLabel = useCategoryLabel();
  // Notion-style subcategory chips, scoped to this category section.
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const subs = useMemo(
    () =>
      subcategories
        .filter((s) => s.category_id === group.category?.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [subcategories, group.category?.id],
  );
  const visible = useMemo(
    () =>
      activeSub
        ? group.poses.filter((p) => p.subcategory_ids.includes(activeSub))
        : group.poses,
    [group.poses, activeSub],
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }


  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-1.5">
        <h2 className="font-serif text-xl">
          {group.category ? catLabel(group.category.name) : t("common.uncategorized")}
        </h2>
        <span className="text-xs text-ink-subtle">
          {visible.length} {visible.length === 1 ? t("common.pose") : t("common.poses")}
        </span>
      </div>

      {subs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSub(null)}
            className={
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
              (activeSub === null
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
              onClick={() => setActiveSub(activeSub === s.id ? null : s.id)}
              className={
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                (activeSub === s.id
                  ? "border-ink bg-ink text-background"
                  : "border-line text-ink-muted hover:border-ink-muted")
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-4 text-xs text-ink-subtle">{t("common.noSubcategoryPoses")}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={visible.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {visible.map((p) => (
                <SortablePoseCard
                  key={p.id}
                  pose={p}
                  onEdit={onEdit}
                  onFavorite={onFavorite}
                  selectedIds={selectedIds}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function CategoryGroupedGrid({
  poses,
  categories,
  subcategories,
  filters,
  onEdit,
  onFavorite,
  onReorder,
  selectedIds,
  onSelect,
}: SelectionProps & {
  poses: Pose[];
  categories: Category[];
  subcategories: Subcategory[];
  filters: { categoryId: string | null };
  onEdit: (p: Pose) => void;
  onFavorite: (p: Pose) => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const groups = useMemo<Group[]>(() => {
    // When a specific category is selected via the filter, render that single
    // group only (poses are already filtered to it).
    if (filters.categoryId) {
      const cat = categories.find((c) => c.id === filters.categoryId) ?? null;
      return [{ category: cat, poses }];
    }
    return groupLibraryPoses(poses, categories);
  }, [poses, categories, filters.categoryId]);

  return (
    <div className="space-y-10">
      {groups.map((g, i) => (
        <div key={g.category?.id ?? "uncategorized"}>
          <CategorySection
            group={g}
            subcategories={subcategories}
            onEdit={onEdit}
            onFavorite={onFavorite}
            onReorder={onReorder}
            selectedIds={selectedIds}
            onSelect={onSelect}
          />
          {i < groups.length - 1 && (
            <div className="pt-4 text-center text-ink-subtle">─────</div>
          )}
        </div>
      ))}
    </div>
  );
}

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Pose Library — VONA" },
      { name: "description", content: "Your personal library of yoga poses with photos, categories, tags, and notes." },
      { property: "og:title", content: "Pose Library — VONA" },
      { property: "og:description", content: "Your personal library of yoga and stretching poses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { practice, setPractice } = usePractice();
  const nav = useNavigate();
  const t = useT();
  const qc = useQueryClient();
  const { data: allPoses = [], isLoading, error } = useQuery({ queryKey: ["poses"], queryFn: fetchPoses });
  const { data: allCategories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: allSubcategories = [] } = useQuery({
    queryKey: ["subcategories"],
    queryFn: fetchSubcategories,
  });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags });
  const { poses, categories, subcategories } = useMemo(() => scopePracticeLibrary(allPoses, allCategories, allSubcategories, practice), [allPoses, allCategories, allSubcategories, practice]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const eligibleSelectedIds = selectedIds.filter((id) => poses.some((pose) => pose.id === id));
  const [editing, setEditing] = useState<Pose | null>(null);
  const [creating, setCreating] = useState(false);
  const { filters, setFilters, filtered } = usePoseFilters(poses);

  const start = useMutation({
    mutationFn: async () => {
      const id = await createSequence({ title: t("home.untitled"), practice_type: practice });
      try { for (const poseId of eligibleSelectedIds) await addPoseToSequence(id, poseId); }
      catch (error) { await purgeSequence(id); throw error; }
      return id;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["sequences"] }); nav({ to: "/sequences/$id", params: { id } }); },
    onError: () => toast.error(t("sequence.saveFailed")),
  });
  const fav = useMutation({
    mutationFn: (p: Pose) => toggleFavorite(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poses"] }),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => reorderPoses(orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poses"] }),
  });

  /**
   * Moves the dragged pose to the target pose's slot in the global library
   * order, then writes the whole order back so it survives reloads.
   */
  function handleReorder(activeId: string, overId: string) {
    const ids = allPoses.map((p) => p.id);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    const byId = new Map(allPoses.map((p) => [p.id, p]));
    // Optimistic: reflect the new order instantly.
    qc.setQueryData<Pose[]>(
      ["poses"],
      ids.flatMap((id, i) => { const pose = byId.get(id); return pose ? [{ ...pose, sort_order: i }] : []; }),
    );
    reorder.mutate(ids);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PracticeToggle value={practice} onChange={(p) => { setPractice(p); setSelectedIds([]); setFilters({ ...filters, categoryId: null }); }} className="mb-4" />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow">{t("library.eyebrow")}</p>
          <h1 className="mt-1 font-serif text-4xl">
            {poses.length} {poses.length === 1 ? t("common.pose") : t("common.poses")}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => start.mutate()} disabled={start.isPending}>{t("builder.start")}{eligibleSelectedIds.length > 0 && <span>({eligibleSelectedIds.length})</span>}</Button>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 size-4" />
          {t("library.newPose")}
        </Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <PoseFiltersPanel
            categories={categories}
            tags={tags}
            filters={filters}
            setFilters={setFilters}
          />
        </aside>

        <div>
          {error ? <p role="alert" className="text-sm text-destructive">{t("sequence.saveFailed")}</p> : isLoading ? (
            <p className="text-sm text-ink-muted">{t("common.loading")}</p>
          ) : filtered.length === 0 && (filters.search || filters.favoritesOnly || filters.tagIds.length > 0) ? (
            <div className="rounded-xl border border-dashed border-line p-16 text-center">
              <p className="font-serif text-2xl">
                {poses.length === 0 ? t("library.emptyTitle") : t("library.noMatchTitle")}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {poses.length === 0 ? t("library.emptyHint") : t("library.noMatchHint")}
              </p>
              {poses.length === 0 && (
                <Button className="mt-4" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 size-4" />
                  {t("library.addPose")}
                </Button>
              )}
            </div>
          ) : (
            <CategoryGroupedGrid
              poses={filtered}
              categories={categories}
              subcategories={subcategories}
              filters={filters}
              onEdit={(p) => setEditing(allPoses.find((original) => original.id === p.id) ?? p)}
              onFavorite={(p) => fav.mutate(p)}
              onReorder={handleReorder}
              selectedIds={eligibleSelectedIds}
              onSelect={(p) => setSelectedIds((ids) => ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id])}
            />
          )}
        </div>
      </div>

      <PoseFormDialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        pose={editing}
      />
    </div>
  );
}
