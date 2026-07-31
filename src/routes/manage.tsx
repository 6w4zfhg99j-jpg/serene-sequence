import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from "lucide-react";

import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  fetchCategories,
  fetchTags,
  reorderCategories,
  updateCategory,
  updateTag,
  type Category,
  type Tag,
} from "@/lib/yoga-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/manage")({
  head: () => ({
    meta: [
      { title: "Categories & Hashtags — Asana" },
      {
        name: "description",
        content:
          "Add, rename, reorder and delete the categories and hashtags used across your yoga pose library.",
      },
      { property: "og:title", content: "Categories & Hashtags — Asana" },
      {
        property: "og:description",
        content: "Manage your yoga pose categories and hashtags.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagePage,
});

function ManagePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="label-eyebrow">Settings</p>
        <h1 className="mt-1 font-serif text-4xl">Categories &amp; hashtags</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Everything here is editable — changes apply everywhere the category or
          hashtag is used.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-2">
        <CategoriesPanel />
        <TagsPanel />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CategoriesPanel() {
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["poses"] });
  };

  const add = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => {
      setNewName("");
      refresh();
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, name),
    onSuccess: () => {
      setEditingId(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      setConfirmId(null);
      refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderCategories(ids),
    onSuccess: refresh,
  });

  const move = (index: number, dir: -1 | 1) => {
    const next = [...categories];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((c) => c.id));
  };

  return (
    <section>
      <PanelHeader title="Categories" count={categories.length} />

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) add.mutate(newName);
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category"
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus className="size-4" />
        </Button>
      </form>

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface/40">
        {categories.map((c: Category, i: number) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            {editingId === c.id ? (
              <RowEditor
                value={draft}
                onChange={setDraft}
                onCancel={() => setEditingId(null)}
                onSave={() => rename.mutate({ id: c.id, name: draft })}
              />
            ) : (
              <>
                <button
                  type="button"
                  className="flex-1 truncate text-left text-sm hover:text-ink-muted"
                  onClick={() => {
                    setEditingId(c.id);
                    setDraft(c.name);
                  }}
                >
                  {c.name}
                </button>
                <span className="shrink-0 text-xs text-ink-muted">
                  {c.pose_count ?? 0}
                </span>
                <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="size-3.5" />
                </IconBtn>
                <IconBtn
                  label="Move down"
                  onClick={() => move(i, 1)}
                  disabled={i === categories.length - 1}
                >
                  <ArrowDown className="size-3.5" />
                </IconBtn>
                {confirmId === c.id ? (
                  <ConfirmDelete
                    hint={
                      (c.pose_count ?? 0) > 0
                        ? `Removes it from ${c.pose_count} pose${c.pose_count === 1 ? "" : "s"}`
                        : undefined
                    }
                    onCancel={() => setConfirmId(null)}
                    onConfirm={() => remove.mutate(c.id)}
                  />
                ) : (
                  <IconBtn label="Delete" onClick={() => setConfirmId(c.id)}>
                    <Trash2 className="size-3.5" />
                  </IconBtn>
                )}
              </>
            )}
          </li>
        ))}
        {categories.length === 0 && <EmptyRow text="No categories yet." />}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function TagsPanel() {
  const qc = useQueryClient();
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags });
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["poses"] });
    qc.invalidateQueries({ queryKey: ["sequences"] });
  };

  const add = useMutation({
    mutationFn: (name: string) => createTag(name),
    onSuccess: () => {
      setNewName("");
      refresh();
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateTag(id, name),
    onSuccess: () => {
      setEditingId(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => {
      setConfirmId(null);
      refresh();
    },
  });

  return (
    <section>
      <PanelHeader title="Hashtags" count={tags.length} />

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) add.mutate(newName);
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New hashtag"
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus className="size-4" />
        </Button>
      </form>

      <p className="mb-3 text-xs text-ink-muted">
        Renaming a hashtag to an existing name merges the two.
      </p>

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface/40">
        {tags.map((t: Tag) => {
          const uses = (t.pose_count ?? 0) + (t.sequence_count ?? 0);
          return (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
              {editingId === t.id ? (
                <RowEditor
                  value={draft}
                  onChange={setDraft}
                  onCancel={() => setEditingId(null)}
                  onSave={() => rename.mutate({ id: t.id, name: draft })}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-sm hover:text-ink-muted"
                    onClick={() => {
                      setEditingId(t.id);
                      setDraft(t.name);
                    }}
                  >
                    #{t.name}
                  </button>
                  <span className="shrink-0 text-xs text-ink-muted">{uses}</span>
                  {confirmId === t.id ? (
                    <ConfirmDelete
                      hint={
                        uses > 0
                          ? `Removes it from ${uses} item${uses === 1 ? "" : "s"}`
                          : undefined
                      }
                      onCancel={() => setConfirmId(null)}
                      onConfirm={() => remove.mutate(t.id)}
                    />
                  ) : (
                    <IconBtn label="Delete" onClick={() => setConfirmId(t.id)}>
                      <Trash2 className="size-3.5" />
                    </IconBtn>
                  )}
                </>
              )}
            </li>
          );
        })}
        {tags.length === 0 && <EmptyRow text="No hashtags yet." />}
      </ul>
    </section>
  );
}

/* ---------------------------- bits -------------------------------- */

function PanelHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="font-serif text-2xl">{title}</h2>
      <span className="text-xs text-ink-muted">{count}</span>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <li className="px-3 py-6 text-center text-sm text-ink-muted">{text}</li>;
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function RowEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
        className="h-8"
      />
      <IconBtn label="Save" onClick={onSave}>
        <Check className="size-3.5" />
      </IconBtn>
      <IconBtn label="Cancel" onClick={onCancel}>
        <X className="size-3.5" />
      </IconBtn>
    </div>
  );
}

function ConfirmDelete({
  hint,
  onConfirm,
  onCancel,
}: {
  hint?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="flex items-center gap-2">
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-md bg-ink px-2 py-1 text-xs text-background"
      >
        Delete
      </button>
      <IconBtn label="Cancel" onClick={onCancel}>
        <X className="size-3.5" />
      </IconBtn>
    </span>
  );
}
