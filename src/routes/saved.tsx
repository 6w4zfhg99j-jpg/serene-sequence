import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Calendar,
  Copy,
  FolderInput,
  GripVertical,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";

import {
  createFolder,
  createSequence,
  deleteFolder,
  deleteSequence,
  duplicateSequence,
  fetchFolders,
  fetchSequences,
  fetchTrashedSequences,
  formatDuration,
  emptyTrash,
  moveSequenceToFolder,
  purgeSequence,
  renameFolder,
  restoreSequence,
  trashDaysLeft,
  type Folder,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FolderTree,
  folderPaths,
  type FolderSelection,
} from "@/components/FolderTree";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [
      { title: "Sequences — VONA Personal Yoga Studio" },
      {
        name: "description",
        content:
          "Your saved yoga sequences, organized in folders you can create, rename, and rearrange anytime.",
      },
      { property: "og:title", content: "Sequences — VONA" },
      {
        property: "og:description",
        content: "Your saved yoga sequences, organized in editable folders.",
      },
    ],
  }),
  component: Home,
});

function descendantIds(folders: Folder[], rootId: string): string[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const f of folders) {
      if (f.parent_id === ids[i]) ids.push(f.id);
    }
  }
  return ids;
}

function Home() {
  const t = useT();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ["sequences"],
    queryFn: fetchSequences,
  });
  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: fetchFolders,
  });

  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newFolderId, setNewFolderId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [selection, setSelection] = useState<FolderSelection>({ kind: "all" });
  const [showTrash, setShowTrash] = useState(false);

  const { data: trashed = [] } = useQuery({
    queryKey: ["sequences", "trash"],
    queryFn: fetchTrashedSequences,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["sequences"] });
    qc.invalidateQueries({ queryKey: ["sequences", "trash"] });
    qc.invalidateQueries({ queryKey: ["folders"] });
  };

  const create = useMutation({
    mutationFn: () =>
      createSequence({
        title: newTitle.trim() || t("home.untitled"),
        folder_id: newFolderId,
      }),
    onSuccess: (id) => {
      refreshAll();
      setShowNew(false);
      setNewTitle("");
      nav({ to: "/sequences/$id", params: { id } });
    },
  });
  const dup = useMutation({
    mutationFn: (id: string) => duplicateSequence(id),
    onSuccess: refreshAll,
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSequence(id),
    onSuccess: refreshAll,
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreSequence(id),
    onSuccess: refreshAll,
  });
  const purge = useMutation({
    mutationFn: (id: string) => purgeSequence(id),
    onSuccess: refreshAll,
  });
  const clearTrash = useMutation({
    mutationFn: () => emptyTrash(),
    onSuccess: refreshAll,
  });
  const move = useMutation({
    mutationFn: (v: { id: string; folderId: string | null }) =>
      moveSequenceToFolder(v.id, v.folderId),
    onSuccess: refreshAll,
  });
  const addFolder = useMutation({
    mutationFn: (v: { name: string; parentId: string | null }) =>
      createFolder(v.name, v.parentId),
    onSuccess: refreshAll,
  });
  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) => renameFolder(v.id, v.name),
    onSuccess: refreshAll,
  });
  const removeFolder = useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: (_d, id) => {
      refreshAll();
      setSelection((s) => (s.kind === "folder" && s.id === id ? { kind: "all" } : s));
    },
  });

  const counts = useMemo(() => {
    const byFolder: Record<string, number> = {};
    let unfiled = 0;
    for (const s of sequences) {
      if (s.folder_id) byFolder[s.folder_id] = (byFolder[s.folder_id] ?? 0) + 1;
      else unfiled++;
    }
    return { all: sequences.length, unfiled, byFolder };
  }, [sequences]);

  const paths = useMemo(() => folderPaths(folders), [folders]);
  const pathLabel = (id: string | null) =>
    id ? (paths.find((p) => p.id === id)?.label ?? t("home.folder")) : t("home.mainArea");

  const scoped = useMemo(() => {
    if (selection.kind === "all") return sequences;
    if (selection.kind === "unfiled") return sequences.filter((s) => !s.folder_id);
    const ids = new Set(descendantIds(folders, selection.id));
    return sequences.filter((s) => s.folder_id && ids.has(s.folder_id));
  }, [sequences, folders, selection]);

  const filtered = scoped.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  );

  const heading = showTrash
    ? t("home.trashHeading")
    : selection.kind === "all"
      ? t("home.heading")
      : selection.kind === "unfiled"
        ? t("home.mainArea")
        : (folders.find((f) => f.id === selection.id)?.name ?? t("home.folder"));

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow">{t("home.eyebrow")}</p>
          <h1 className="mt-1 font-serif text-5xl">{heading}</h1>
          <p className="mt-2 max-w-lg text-sm text-ink-muted">
            {showTrash ? t("home.trashDescription") : t("home.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("home.search")}
            className="w-56"
          />
          <Button
            onClick={() => {
              setNewFolderId(selection.kind === "folder" ? selection.id : null);
              setShowNew(true);
            }}
          >
            <Plus className="mr-1 size-4" />
            {t("home.newSequence")}
          </Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <FolderTree
            folders={folders}
            counts={counts}
            selection={selection}
            onSelect={setSelection}
            onCreate={(name, parentId) => addFolder.mutate({ name, parentId })}
            onRename={(id, name) => rename.mutate({ id, name })}
            onDelete={(id) => removeFolder.mutate(id)}
            onDropSequence={(id, folderId) => move.mutate({ id, folderId })}
          />
          <button
            type="button"
            onClick={() => setShowTrash((v) => !v)}
            className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              showTrash
                ? "bg-surface text-ink"
                : "text-ink-muted hover:bg-surface hover:text-ink"
            }`}
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
            <span className="flex-1 text-left">{t("home.trash")}</span>
            {trashed.length > 0 && (
              <span className="text-xs text-ink-subtle">{trashed.length}</span>
            )}
          </button>
        </aside>

        <div>
          {showTrash ? (
            trashed.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-20 text-center">
                <h2 className="font-serif text-3xl">{t("home.trashEmpty")}</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {t("home.trashEmptyHint")}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => clearTrash.mutate()}
                  >
                    {t("home.emptyTrash")}
                  </Button>
                </div>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {trashed.map((s) => {
                    const left = trashDaysLeft(s.deleted_at);
                    return (
                      <li
                        key={s.id}
                        className="group flex items-center gap-3 px-4 py-4"
                      >
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-serif text-xl text-ink-muted">
                            {s.title}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-ink-subtle">
                            <span>
                              {s.pose_count} {t("common.poses")}
                            </span>
                            <span>
                              {left <= 1
                                ? t("home.lastDay")
                                : `${left} ${t("home.daysLeft")}`}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => restore.mutate(s.id)}
                          title={t("home.restore")}
                        >
                          <RotateCcw className="size-4" strokeWidth={1.5} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => purge.mutate(s.id)}
                          title={t("home.deleteForever")}
                        >
                          <Trash2 className="size-4" strokeWidth={1.5} />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )
          ) : isLoading ? (
            <p className="text-sm text-ink-muted">{t("common.loading")}</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-20 text-center">
              <h2 className="font-serif text-3xl">
                {sequences.length === 0
                  ? t("home.emptyNone")
                  : scoped.length === 0
                    ? t("home.emptyFolder")
                    : t("home.emptySearch")}
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                {sequences.length === 0
                  ? t("home.emptyNoneHint")
                  : scoped.length === 0
                    ? t("home.emptyFolderHint")
                    : t("home.emptySearchHint")}
              </p>
              <div className="mt-6 flex justify-center gap-2">
                <Button
                  onClick={() => {
                    setNewFolderId(selection.kind === "folder" ? selection.id : null);
                    setShowNew(true);
                  }}
                >
                  {t("home.newSequence")}
                </Button>
                {sequences.length === 0 && (
                  <Button variant="outline" asChild>
                    <Link to="/library">{t("home.goToLibrary")}</Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {filtered.map((s) => (
                <li
                  key={s.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/sequence-id", s.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="group flex items-center gap-3 px-4 py-4 hover:bg-background"
                >
                  <GripVertical
                    className="size-4 shrink-0 cursor-grab text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100"
                    strokeWidth={1.5}
                  />
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
                      <span>{s.pose_count} {t("common.poses")}</span>
                      <span>{formatDuration(s.total_duration_seconds)}</span>
                      {selection.kind !== "folder" && (
                        <span className="text-ink-muted">{pathLabel(s.folder_id)}</span>
                      )}
                      {s.tags.slice(0, 4).map((t) => (
                        <span key={t.id} className="text-accent">
                          #{t.name}
                        </span>
                      ))}
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" title={t("home.moveToFolder")}>
                          <FolderInput className="size-4" strokeWidth={1.5} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                        <DropdownMenuItem
                          onClick={() => move.mutate({ id: s.id, folderId: null })}
                          disabled={!s.folder_id}
                        >
                          Main area
                        </DropdownMenuItem>
                        {paths.length > 0 && <DropdownMenuSeparator />}
                        {paths.map((p) => (
                          <DropdownMenuItem
                            key={p.id}
                            onClick={() => move.mutate({ id: s.id, folderId: p.id })}
                            disabled={s.folder_id === p.id}
                          >
                            {p.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dup.mutate(s.id)}
                      title={t("common.duplicate")}
                    >
                      <Copy className="size-4" strokeWidth={1.5} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => del.mutate(s.id)}
                      title={t("common.delete")}
                    >
                      <Trash2 className="size-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">New sequence</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t("home.titlePlaceholder")}
            onKeyDown={(e) => e.key === "Enter" && create.mutate()}
          />
          <label className="text-sm text-ink-muted">
            Save into
            <select
              value={newFolderId ?? ""}
              onChange={(e) => setNewFolderId(e.target.value || null)}
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            >
              <option value="">{t("home.mainArea")}</option>
              {paths.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Create &amp; build
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
