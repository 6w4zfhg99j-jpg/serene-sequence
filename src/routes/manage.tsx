import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import {
  createCategory,
  createSubcategory,
  createTag,
  deleteCategory,
  deleteSubcategory,
  deleteTag,
  fetchCategories,
  fetchSubcategories,
  fetchTags,
  reorderCategories,
  reorderSubcategories,
  updateCategory,
  updateSubcategory,
  updateTag,
  type Category,
  type Subcategory,
  type Tag,
} from "@/lib/yoga-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSettings } from "@/components/LanguageSettings";
import { useT } from "@/lib/i18n";
import { useCategoryLabel } from "@/lib/i18n/categories";

export const Route = createFileRoute("/manage")({
  head: () => ({
    meta: [
      { title: "Categories & Hashtags — VONA" },
      {
        name: "description",
        content:
          "Add, rename, reorder and delete the categories and hashtags used across your yoga pose library.",
      },
      { property: "og:title", content: "Categories & Hashtags — VONA" },
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
  const t = useT();
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="label-eyebrow">{t("settings.eyebrow")}</p>
        <h1 className="mt-1 font-serif text-4xl">{t("settings.title")}</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Everything here is editable — changes apply everywhere the category or
          hashtag is used. Expand a category to manage its subcategories.
        </p>
      </header>

      <div className="mb-10 max-w-md">
        <LanguageSettings />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <CategoriesPanel />
        <TagsPanel />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CategoriesPanel() {
  const t = useT();
  const catLabel = useCategoryLabel();
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["subcategories"] });
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
      <PanelHeader title={t("manage.categories")} count={categories.length} />

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
          placeholder={t("manage.newCategory")}
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus className="size-4" />
        </Button>
      </form>

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface/40">
        {categories.map((c: Category, i: number) => (
          <li key={c.id} className="px-3 py-2">
            <div className="flex items-center gap-2">
              {editingId === c.id ? (
                <RowEditor
                  value={draft}
                  onChange={setDraft}
                  onCancel={() => setEditingId(null)}
                  onSave={() => rename.mutate({ id: c.id, name: draft })}
                />
              ) : (
                <>
                  <IconBtn
                    label={t("manage.subcategories")}
                    onClick={() =>
                      setExpandedId((cur) => (cur === c.id ? null : c.id))
                    }
                  >
                    <ChevronRight
                      className={
                        "size-3.5 transition-transform " +
                        (expandedId === c.id ? "rotate-90" : "")
                      }
                    />
                  </IconBtn>
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-sm hover:text-ink-muted"
                    onClick={() => {
                      setEditingId(c.id);
                      setDraft(c.name);
                    }}
                  >
                    {catLabel(c.name)}
                  </button>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {c.pose_count ?? 0}
                  </span>
                  <IconBtn label={t("common.moveUp")} onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="size-3.5" />
                  </IconBtn>
                  <IconBtn
                    label={t("common.moveDown")}
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
                    <IconBtn label={t("common.delete")} onClick={() => setConfirmId(c.id)}>
                      <Trash2 className="size-3.5" />
                    </IconBtn>
                  )}
                </>
              )}
            </div>
            {expandedId === c.id && <SubcategoriesEditor categoryId={c.id} />}
          </li>
        ))}
        {categories.length === 0 && <EmptyRow text={t("manage.noCategories")} />}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function SubcategoriesEditor({ categoryId }: { categoryId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: all = [] } = useQuery({
    queryKey: ["subcategories"],
    queryFn: fetchSubcategories,
  });
  const subs = all
    .filter((s: Subcategory) => s.category_id === categoryId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["subcategories"] });
    qc.invalidateQueries({ queryKey: ["poses"] });
  };

  const add = useMutation({
    mutationFn: (name: string) => createSubcategory(categoryId, name),
    onSuccess: () => {
      setNewName("");
      refresh();
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateSubcategory(id, name),
    onSuccess: () => {
      setEditingId(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteSubcategory(id),
    onSuccess: () => {
      setConfirmId(null);
      refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderSubcategories(ids),
    onSuccess: refresh,
  });

  const move = (index: number, dir: -1 | 1) => {
    const next = [...subs];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((s) => s.id));
  };

  return (
    <div className="mb-1 ml-8 mt-2 border-l border-line pl-3">
      <p className="label-eyebrow mb-1.5">Subcategories</p>
      <ul className="mb-2 space-y-1">
        {subs.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            {editingId === s.id ? (
              <RowEditor
                value={draft}
                onChange={setDraft}
                onCancel={() => setEditingId(null)}
                onSave={() => rename.mutate({ id: s.id, name: draft })}
              />
            ) : (
              <>
                <button
                  type="button"
                  className="flex-1 truncate text-left text-xs hover:text-ink-muted"
                  onClick={() => {
                    setEditingId(s.id);
                    setDraft(s.name);
                  }}
                >
                  {s.name}
                </button>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {s.pose_count ?? 0}
                </span>
                <IconBtn label={t("common.moveUp")} onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="size-3" />
                </IconBtn>
                <IconBtn
                  label={t("common.moveDown")}
                  onClick={() => move(i, 1)}
                  disabled={i === subs.length - 1}
                >
                  <ArrowDown className="size-3" />
                </IconBtn>
                {confirmId === s.id ? (
                  <ConfirmDelete
                    hint={
                      (s.pose_count ?? 0) > 0
                        ? `Unassigns ${s.pose_count} pose${s.pose_count === 1 ? "" : "s"}`
                        : undefined
                    }
                    onCancel={() => setConfirmId(null)}
                    onConfirm={() => remove.mutate(s.id)}
                  />
                ) : (
                  <IconBtn label={t("common.delete")} onClick={() => setConfirmId(s.id)}>
                    <Trash2 className="size-3" />
                  </IconBtn>
                )}
              </>
            )}
          </li>
        ))}
        {subs.length === 0 && (
          <li className="text-xs text-ink-subtle">No subcategories yet.</li>
        )}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) add.mutate(newName);
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("manage.newSubcategory")}
          className="h-7 text-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!newName.trim()}>
          <Plus className="size-3" />
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TagsPanel() {
  const t = useT();
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
      <PanelHeader title={t("manage.hashtags")} count={tags.length} />

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
          placeholder={t("manage.newHashtag")}
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus className="size-4" />
        </Button>
      </form>

      <p className="mb-3 text-xs text-ink-muted">
        Renaming a hashtag to an existing name merges the two.
      </p>

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface/40">
        {tags.map((tg: Tag) => {
          const uses = (tg.pose_count ?? 0) + (tg.sequence_count ?? 0);
          return (
            <li key={tg.id} className="flex items-center gap-2 px-3 py-2">
              {editingId === tg.id ? (
                <RowEditor
                  value={draft}
                  onChange={setDraft}
                  onCancel={() => setEditingId(null)}
                  onSave={() => rename.mutate({ id: tg.id, name: draft })}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-sm hover:text-ink-muted"
                    onClick={() => {
                      setEditingId(tg.id);
                      setDraft(tg.name);
                    }}
                  >
                    #{tg.name}
                  </button>
                  <span className="shrink-0 text-xs text-ink-muted">{uses}</span>
                  {confirmId === tg.id ? (
                    <ConfirmDelete
                      hint={
                        uses > 0
                          ? `Removes it from ${uses} item${uses === 1 ? "" : "s"}`
                          : undefined
                      }
                      onCancel={() => setConfirmId(null)}
                      onConfirm={() => remove.mutate(tg.id)}
                    />
                  ) : (
                    <IconBtn label={t("common.delete")} onClick={() => setConfirmId(tg.id)}>
                      <Trash2 className="size-3.5" />
                    </IconBtn>
                  )}
                </>
              )}
            </li>
          );
        })}
        {tags.length === 0 && <EmptyRow text={t("manage.noHashtags")} />}
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
  const t = useT();
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
      <IconBtn label={t("common.save")} onClick={onSave}>
        <Check className="size-3.5" />
      </IconBtn>
      <IconBtn label={t("common.cancel")} onClick={onCancel}>
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
  const t = useT();
  return (
    <span className="flex items-center gap-2">
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-md bg-ink px-2 py-1 text-xs text-background"
      >
        {t("common.delete")}
      </button>
      <IconBtn label={t("common.cancel")} onClick={onCancel}>
        <X className="size-3.5" />
      </IconBtn>
    </span>
  );
}
