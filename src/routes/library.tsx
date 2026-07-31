import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { fetchCategories, fetchPoses, fetchTags, toggleFavorite, type Pose } from "@/lib/yoga-api";
import { Button } from "@/components/ui/button";
import { PoseCard } from "@/components/PoseCard";
import { PoseFormDialog } from "@/components/PoseFormDialog";
import { PoseFiltersPanel, usePoseFilters } from "@/components/PoseFilters";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Pose Library — Asana" },
      { name: "description", content: "Your personal library of yoga poses with photos, categories, tags, and notes." },
      { property: "og:title", content: "Pose Library — Asana" },
      { property: "og:description", content: "Your personal library of yoga poses." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const qc = useQueryClient();
  const { data: poses = [], isLoading } = useQuery({ queryKey: ["poses"], queryFn: fetchPoses });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags });
  const [editing, setEditing] = useState<Pose | null>(null);
  const [creating, setCreating] = useState(false);
  const { filters, setFilters, filtered } = usePoseFilters(poses);

  const fav = useMutation({
    mutationFn: (p: Pose) => toggleFavorite(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poses"] }),
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow">Library</p>
          <h1 className="mt-1 font-serif text-4xl">
            {poses.length} {poses.length === 1 ? "pose" : "poses"}
          </h1>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 size-4" />
          New pose
        </Button>
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
          {isLoading ? (
            <p className="text-sm text-ink-muted">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-16 text-center">
              <p className="font-serif text-2xl">
                {poses.length === 0 ? "No poses yet" : "No poses match"}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {poses.length === 0
                  ? "Add your first pose to start building sequences."
                  : "Try clearing a filter."}
              </p>
              {poses.length === 0 && (
                <Button className="mt-4" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 size-4" />
                  Add pose
                </Button>
              )}
            </div>
          ) : (
            <CategoryGroupedGrid
              poses={filtered}
              categories={categories}
              filters={filters}
              onEdit={(p) => setEditing(p)}
              onFavorite={(p) => fav.mutate(p)}
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
