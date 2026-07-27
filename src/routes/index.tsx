import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Calendar, Copy, FileDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

import {
  createSequence,
  deleteSequence,
  duplicateSequence,
  fetchSequences,
  formatDuration,
} from "@/lib/yoga-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sequences — Asana Personal Yoga Studio" },
      {
        name: "description",
        content: "Your saved yoga sequences. Build, edit, duplicate, and export to PDF.",
      },
      { property: "og:title", content: "Sequences — Asana" },
      { property: "og:description", content: "Your saved yoga sequences." },
    ],
  }),
  component: Home,
});

function Home() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ["sequences"],
    queryFn: fetchSequences,
  });
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [showNew, setShowNew] = useState(false);

  const create = useMutation({
    mutationFn: () => createSequence({ title: newTitle.trim() || "Untitled sequence" }),
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["sequences"] });
      setShowNew(false);
      setNewTitle("");
      nav({ to: "/sequences/$id", params: { id } });
    },
  });
  const dup = useMutation({
    mutationFn: (id: string) => duplicateSequence(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sequences"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSequence(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sequences"] }),
  });

  const filtered = sequences.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow">Your Studio</p>
          <h1 className="mt-1 font-serif text-5xl">Sequences</h1>
          <p className="mt-2 max-w-lg text-sm text-ink-muted">
            Assemble poses from your library into a class. Save, duplicate,
            print — no timer running, no eyes over your shoulder.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sequences..."
            className="w-56"
          />
          <Button onClick={() => setShowNew(true)}>
            <Plus className="mr-1 size-4" />
            New sequence
          </Button>
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-20 text-center">
          <h2 className="font-serif text-3xl">
            {sequences.length === 0 ? "Nothing built yet." : "Nothing matches."}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            {sequences.length === 0
              ? "Start with your first sequence — or fill the library first."
              : "Try a different search."}
          </p>
          {sequences.length === 0 && (
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={() => setShowNew(true)}>New sequence</Button>
              <Button variant="outline" asChild>
                <Link to="/library">Go to library</Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {filtered.map((s) => (
            <li key={s.id} className="group flex items-center gap-4 px-5 py-4 hover:bg-background">
              <Link
                to="/sequences/$id"
                params={{ id: s.id }}
                className="min-w-0 flex-1"
              >
                <div className="flex items-baseline gap-3">
                  <h3 className="truncate font-serif text-xl">{s.title}</h3>
                  <span className="label-eyebrow">{s.level.replace("-", " ")}</span>
                </div>
                {s.description && (
                  <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">
                    {s.description}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="size-3" strokeWidth={1.5} />
                    {format(new Date(s.updated_at), "MMM d, yyyy")}
                  </span>
                  <span>{s.pose_count} poses</span>
                  <span>{formatDuration(s.total_duration_seconds)}</span>
                  {s.tags.slice(0, 4).map((t) => (
                    <span key={t.id} className="text-accent">
                      #{t.name}
                    </span>
                  ))}
                </div>
              </Link>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dup.mutate(s.id)}
                  title="Duplicate"
                >
                  <Copy className="size-4" strokeWidth={1.5} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete "${s.title}"?`)) del.mutate(s.id);
                  }}
                  title="Delete"
                >
                  <Trash2 className="size-4" strokeWidth={1.5} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">New sequence</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Morning solar flow"
            onKeyDown={(e) => e.key === "Enter" && create.mutate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Create & build
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
