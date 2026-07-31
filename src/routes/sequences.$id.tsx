import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Copy,
  FileDown,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import {
  addPoseToSequence,
  createTag,
  deleteSequence,
  duplicateSequenceItem,
  fetchCategories,
  fetchPoses,
  fetchSequence,
  fetchTags,
  formatDuration,
  removeSequenceItem,
  reorderSequenceItems,
  setSequenceTags,
  updateSequence,
  updateSequenceItem,
  type Level,
  type SequencePoseItem,
} from "@/lib/yoga-api";
import { BuilderLibrary } from "@/components/BuilderLibrary";
import { PoseImage } from "@/components/PoseImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { exportSequencePdf, type PdfLayout } from "@/lib/pdf-export";

const LEVELS: Level[] = ["all-levels", "beginner", "intermediate", "advanced"];

export const Route = createFileRoute("/sequences/$id")({
  head: () => ({
    meta: [
      { title: "Sequence — Asana" },
      { name: "description", content: "Build and edit a yoga sequence." },
      { property: "og:title", content: "Sequence — Asana" },
      { property: "og:description", content: "Build and edit a yoga sequence." },
    ],
  }),
  component: SequenceEditor,
});

function SequenceEditor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: seq, isLoading } = useQuery({
    queryKey: ["sequence", id],
    queryFn: () => fetchSequence(id),
  });
  const { data: poses = [] } = useQuery({ queryKey: ["poses"], queryFn: fetchPoses });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sequence", id] });

  const patch = useMutation({
    mutationFn: (p: Parameters<typeof updateSequence>[1]) => updateSequence(id, p),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["sequences"] });
    },
  });
  const addPose = useMutation({
    mutationFn: (poseId: string) => addPoseToSequence(id, poseId),
    onSuccess: invalidate,
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => removeSequenceItem(itemId),
    onSuccess: invalidate,
  });
  const dupItem = useMutation({
    mutationFn: (it: SequencePoseItem) => duplicateSequenceItem(it),
    onSuccess: invalidate,
  });
  const patchItem = useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof updateSequenceItem>[1] }) =>
      updateSequenceItem(args.id, args.patch),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderSequenceItems(id, ids),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: () => deleteSequence(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sequences"] });
      nav({ to: "/" });
    },
  });
  const applyTags = useMutation({
    mutationFn: (tagIds: string[]) => setSequenceTags(id, tagIds),
    onSuccess: invalidate,
  });
  const newTag = useMutation({
    mutationFn: (raw: string) => createTag(raw),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      if (seq) applyTags.mutate([...seq.tags.map((x) => x.id), t.id]);
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [showExport, setShowExport] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [layout, setLayout] = useState<PdfLayout>("grid");
  const [exporting, setExporting] = useState(false);


  if (isLoading || !seq) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-ink-subtle" />
      </div>
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !seq) return;
    const oldIdx = seq.items.findIndex((i) => i.id === active.id);
    const newIdx = seq.items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const newIds = arrayMove(seq.items, oldIdx, newIdx).map((i) => i.id);
    // Optimistic
    qc.setQueryData(["sequence", id], {
      ...seq,
      items: arrayMove(seq.items, oldIdx, newIdx).map((it, i) => ({ ...it, position: i })),
    });
    reorder.mutate(newIds);
  }

  const totalDuration = seq.items.reduce(
    (s, it) => s + (it.duration_seconds ?? it.pose.duration_seconds ?? 0),
    0
  );

  async function doExport() {
    if (!seq) return;
    setExporting(true);
    try {
      await exportSequencePdf(seq, { includeNotes, layout });
      setShowExport(false);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <Button variant="ghost" size="sm" onClick={() => nav({ to: "/" })}>
            <ArrowLeft className="mr-1 size-4" /> All sequences
          </Button>
          <Input
            value={seq.title}
            onChange={(e) =>
              qc.setQueryData(["sequence", id], { ...seq, title: e.target.value })
            }
            onBlur={(e) => patch.mutate({ title: e.target.value })}
            className="mt-2 border-none bg-transparent px-0 font-serif !text-4xl shadow-none focus-visible:ring-0"
          />
          <Textarea
            value={seq.description ?? ""}
            onChange={(e) =>
              qc.setQueryData(["sequence", id], { ...seq, description: e.target.value })
            }
            onBlur={(e) => patch.mutate({ description: e.target.value || null })}
            placeholder="Describe the intention of this sequence..."
            rows={2}
            className="mt-1 border-none bg-transparent px-0 text-sm text-ink-muted shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowExport(true)}>
            <FileDown className="mr-1 size-4" /> Export PDF
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("Delete this sequence?")) del.mutate();
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Meta row */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-surface px-5 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="label-eyebrow">Level</span>
          <Select
            value={seq.level}
            onValueChange={(v) => patch.mutate({ level: v as Level })}
          >
            <SelectTrigger className="h-8 w-40 border-line">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={l} className="capitalize">
                  {l.replace("-", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="label-eyebrow mr-2">Total</span>
          <span className="font-medium">{formatDuration(totalDuration)}</span>
        </div>
        <div>
          <span className="label-eyebrow mr-2">Poses</span>
          <span className="font-medium">{seq.items.length}</span>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          <span className="label-eyebrow mr-1">Tags</span>
          {tags.map((t) => {
            const on = seq.tags.some((x) => x.id === t.id);
            return (
              <button
                key={t.id}
                onClick={() =>
                  applyTags.mutate(
                    on
                      ? seq.tags.filter((x) => x.id !== t.id).map((x) => x.id)
                      : [...seq.tags.map((x) => x.id), t.id]
                  )
                }
                className={
                  "rounded-full border px-2 py-0.5 text-xs transition-colors " +
                  (on
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-line text-ink-muted hover:border-ink-muted")
                }
              >
                #{t.name}
              </button>
            );
          })}
          <TagQuickAdd onCreate={(raw) => newTag.mutate(raw)} />
        </div>
      </div>

      {/* Two-panel */}
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
        {/* Library */}
        <section className="flex max-h-[calc(100vh-14rem)] flex-col rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl">Pose library</h2>
            <span className="text-xs text-ink-subtle">{poses.length}</span>
          </div>
          {poses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-ink-muted">
              Your library is empty.{" "}
              <a href="/library" className="underline">
                Add poses first.
              </a>
            </div>
          ) : (
            <BuilderLibrary
              poses={poses}
              categories={categories}
              onAdd={(p) => addPose.mutate(p.id)}
            />
          )}
        </section>

        {/* Sequence */}
        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl">Current sequence</h2>
            <span className="text-xs text-ink-subtle">
              Drag the handle to reorder
            </span>
          </div>
          {seq.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-12 text-center">
              <p className="font-serif text-xl">Empty mat.</p>
              <p className="mt-1 text-sm text-ink-muted">
                Click a pose on the left to add it here.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={seq.items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <ol className="space-y-2">
                  {seq.items.map((it, idx) => (
                    <SequenceRow
                      key={it.id}
                      item={it}
                      index={idx}
                      onRemove={() => removeItem.mutate(it.id)}
                      onDuplicate={() => dupItem.mutate(it)}
                      onPatch={(p) => patchItem.mutate({ id: it.id, patch: p })}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </section>
      </div>

      {/* Export */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Export PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["grid", "Compact grid", "Thumbnails + names, fills the page"],
                  ["list", "Detailed list", "One pose per row with cues"],
                ] as const
              ).map(([val, title, sub]) => (
                <button
                  key={val}
                  onClick={() => setLayout(val)}
                  className={
                    "rounded-lg border p-3 text-left transition-colors " +
                    (layout === val
                      ? "border-accent bg-accent/10"
                      : "border-line hover:border-ink-muted")
                  }
                >
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{sub}</span>
                </button>
              ))}
            </div>
            {layout === "list" && (
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={includeNotes}
                  onCheckedChange={(v) => setIncludeNotes(!!v)}
                />
                <span>Include per-pose notes</span>
              </label>
            )}
            <p className="text-xs text-ink-muted">
              Formatted for A4 with clean margins. Prints beautifully.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExport(false)}>
              Cancel
            </Button>
            <Button onClick={doExport} disabled={exporting}>
              {exporting && <Loader2 className="mr-2 size-3 animate-spin" />}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TagQuickAdd({ onCreate }: { onCreate: (raw: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && val.trim()) {
          onCreate(val);
          setVal("");
        }
      }}
      placeholder="+ new tag"
      className="w-20 rounded-full border border-dashed border-line bg-transparent px-2 py-0.5 text-xs outline-none placeholder:text-ink-subtle focus:border-ink-muted focus:w-28"
    />
  );
}

function SequenceRow({
  item,
  index,
  onRemove,
  onDuplicate,
  onPatch,
}: {
  item: SequencePoseItem;
  index: number;
  onRemove: () => void;
  onDuplicate: () => void;
  onPatch: (p: Parameters<typeof updateSequenceItem>[1]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [openNotes, setOpenNotes] = useState(false);
  const [localNotes, setLocalNotes] = useState(item.notes ?? "");
  const [localDur, setLocalDur] = useState(
    item.duration_seconds ? String(item.duration_seconds) : ""
  );
  useEffect(() => setLocalNotes(item.notes ?? ""), [item.notes]);
  useEffect(
    () => setLocalDur(item.duration_seconds ? String(item.duration_seconds) : ""),
    [item.duration_seconds]
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group rounded-lg border border-line bg-background"
    >
      <div className="flex items-center gap-3 p-2.5">
        <button
          className="cursor-grab touch-none text-ink-subtle hover:text-ink"
          {...attributes}
          {...listeners}
          aria-label="Drag"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="w-6 font-serif text-sm italic text-ink-subtle">
          {String(index + 1).padStart(2, "0")}
        </span>
        <PoseImage
          path={item.pose.image_url}
          alt={item.pose.name}
          className="size-12 shrink-0 rounded-md object-cover"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{item.pose.name}</h3>
          {item.pose.sanskrit_name && (
            <p className="truncate text-xs italic text-ink-muted">
              {item.pose.sanskrit_name}
            </p>
          )}
        </div>
        <button
          onClick={() => setOpenNotes((v) => !v)}
          className="rounded px-2 py-1 text-xs text-ink-muted hover:bg-surface hover:text-ink"
        >
          {formatDuration(item.duration_seconds ?? item.pose.duration_seconds)}
        </button>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicate">
            <Copy className="size-3.5" strokeWidth={1.5} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove} title="Remove">
            <Trash2 className="size-3.5" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
      {openNotes && (
        <div className="space-y-2 border-t border-line px-3 pb-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Duration (sec)</Label>
              <Input
                type="number"
                value={localDur}
                onChange={(e) => setLocalDur(e.target.value)}
                onBlur={() =>
                  onPatch({ duration_seconds: localDur ? Number(localDur) : null })
                }
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Side</Label>
              <Select
                value={item.side ?? "none"}
                onValueChange={(v) => onPatch({ side: v === "none" ? null : v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Both / N/A</SelectItem>
                  <SelectItem value="Right">Right</SelectItem>
                  <SelectItem value="Left">Left</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Cues / notes for this pose</Label>
            <Textarea
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onBlur={() => onPatch({ notes: localNotes || null })}
              rows={2}
              placeholder="Cue the breath, alignment, a variation..."
            />
          </div>
        </div>
      )}
    </li>
  );
}
