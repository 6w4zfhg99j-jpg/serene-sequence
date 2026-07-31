import { useState } from "react";
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  Inbox,
  Layers,
  Pencil,
  Trash2,
} from "lucide-react";

import type { Folder } from "@/lib/yoga-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type FolderSelection =
  | { kind: "all" }
  | { kind: "unfiled" }
  | { kind: "folder"; id: string };

export interface FolderTreeProps {
  folders: Folder[];
  counts: { all: number; unfiled: number; byFolder: Record<string, number> };
  selection: FolderSelection;
  onSelect: (s: FolderSelection) => void;
  onCreate: (name: string, parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Called when a sequence is dropped onto a folder row (null = main area). */
  onDropSequence: (sequenceId: string, folderId: string | null) => void;
}

const isSelected = (s: FolderSelection, id: string) =>
  s.kind === "folder" && s.id === id;

function rowClass(active: boolean, over: boolean) {
  return (
    "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors " +
    (active
      ? "bg-ink text-background"
      : over
        ? "bg-accent/10 ring-1 ring-accent"
        : "hover:bg-background")
  );
}

export function FolderTree({
  folders,
  counts,
  selection,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDropSequence,
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [addingUnder, setAddingUnder] = useState<string | null | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [overId, setOverId] = useState<string | "root" | null>(null);

  const children = (parentId: string | null) =>
    folders
      .filter((f) => f.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const descendantCount = (id: string): number => {
    let total = counts.byFolder[id] ?? 0;
    for (const c of children(id)) total += descendantCount(c.id);
    return total;
  };

  const startAdd = (parentId: string | null) => {
    setAddingUnder(parentId);
    setNewName("");
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
  };

  const commitAdd = () => {
    const name = newName.trim();
    if (name) onCreate(name, addingUnder ?? null);
    setAddingUnder(undefined);
    setNewName("");
  };

  const renderFolder = (f: Folder, depth: number) => {
    const kids = children(f.id);
    const open = !!expanded[f.id];
    const active = isSelected(selection, f.id);
    return (
      <li key={f.id}>
        <div
          className={rowClass(active, overId === f.id)}
          style={{ paddingLeft: 8 + depth * 14 }}
          onDragOver={(e) => {
            e.preventDefault();
            setOverId(f.id);
          }}
          onDragLeave={() => setOverId((o) => (o === f.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            setOverId(null);
            const seqId = e.dataTransfer.getData("text/sequence-id");
            if (seqId) onDropSequence(seqId, f.id);
          }}
        >
          <button
            type="button"
            onClick={() => setExpanded((s) => ({ ...s, [f.id]: !open }))}
            className={kids.length ? "shrink-0" : "shrink-0 opacity-0"}
            tabIndex={kids.length ? 0 : -1}
            aria-label={open ? "Collapse folder" : "Expand folder"}
          >
            <ChevronRight
              className={"size-3.5 transition-transform " + (open ? "rotate-90" : "")}
              strokeWidth={2}
            />
          </button>

          {renamingId === f.id ? (
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft.trim()) onRename(f.id, draft.trim());
                setRenamingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="h-7 py-0 text-sm"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSelect({ kind: "folder", id: f.id })}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <FolderIcon className="size-3.5 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{f.name}</span>
                <span
                  className={
                    "ml-auto text-xs " + (active ? "opacity-70" : "text-ink-subtle")
                  }
                >
                  {descendantCount(f.id) || ""}
                </span>
              </button>
              <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="New subfolder"
                  onClick={() => startAdd(f.id)}
                  className="p-1"
                >
                  <FolderPlus className="size-3.5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  title="Rename"
                  onClick={() => {
                    setRenamingId(f.id);
                    setDraft(f.name);
                  }}
                  className="p-1"
                >
                  <Pencil className="size-3.5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  title="Delete folder"
                  onClick={() => onDelete(f.id)}
                  className="p-1"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.5} />
                </button>
              </span>
            </>
          )}
        </div>

        {addingUnder === f.id && (
          <div style={{ paddingLeft: 22 + depth * 14 }} className="py-1 pr-2">
            <Input
              autoFocus
              value={newName}
              placeholder="Folder name"
              onChange={(e) => setNewName(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setAddingUnder(undefined);
              }}
              className="h-7 py-0 text-sm"
            />
          </div>
        )}

        {open && kids.length > 0 && (
          <ul>{kids.map((c) => renderFolder(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <nav className="space-y-1">
      <button
        type="button"
        onClick={() => onSelect({ kind: "all" })}
        className={rowClass(selection.kind === "all", false)}
      >
        <Layers className="size-3.5" strokeWidth={1.5} />
        <span>All sequences</span>
        <span
          className={
            "ml-auto text-xs " +
            (selection.kind === "all" ? "opacity-70" : "text-ink-subtle")
          }
        >
          {counts.all || ""}
        </span>
      </button>

      <div
        className={rowClass(selection.kind === "unfiled", overId === "root")}
        onDragOver={(e) => {
          e.preventDefault();
          setOverId("root");
        }}
        onDragLeave={() => setOverId((o) => (o === "root" ? null : o))}
        onDrop={(e) => {
          e.preventDefault();
          setOverId(null);
          const seqId = e.dataTransfer.getData("text/sequence-id");
          if (seqId) onDropSequence(seqId, null);
        }}
      >
        <button
          type="button"
          onClick={() => onSelect({ kind: "unfiled" })}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Inbox className="size-3.5" strokeWidth={1.5} />
          <span className="truncate">Main area</span>
          <span
            className={
              "ml-auto text-xs " +
              (selection.kind === "unfiled" ? "opacity-70" : "text-ink-subtle")
            }
          >
            {counts.unfiled || ""}
          </span>
        </button>
      </div>

      <div className="pt-2">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="label-eyebrow">Folders</span>
          <button
            type="button"
            title="New folder"
            onClick={() => startAdd(null)}
            className="p-1 text-ink-muted hover:text-ink"
          >
            <FolderPlus className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <ul>{children(null).map((f) => renderFolder(f, 0))}</ul>

        {addingUnder === null && (
          <div className="px-2 py-1">
            <Input
              autoFocus
              value={newName}
              placeholder="Folder name"
              onChange={(e) => setNewName(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setAddingUnder(undefined);
              }}
              className="h-7 py-0 text-sm"
            />
          </div>
        )}

        {folders.length === 0 && addingUnder === undefined && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-ink-muted"
            onClick={() => startAdd(null)}
          >
            <FolderPlus className="mr-1 size-3.5" strokeWidth={1.5} />
            New folder
          </Button>
        )}
      </div>
    </nav>
  );
}

/** Flatten folders into indented "Parent / Child" paths for pickers. */
export function folderPaths(folders: Folder[]): { id: string; label: string }[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const arr = byParent.get(f.parent_id) ?? [];
    arr.push(f);
    byParent.set(f.parent_id, arr);
  }
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, prefix: string) => {
    const list = (byParent.get(parent) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
    for (const f of list) {
      const label = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ id: f.id, label });
      walk(f.id, label);
    }
  };
  walk(null, "");
  return out;
}
