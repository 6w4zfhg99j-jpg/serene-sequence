import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import {
  createTag,
  deletePose,
  fetchCategories,
  fetchSubcategories,
  fetchTags,
  uploadPoseImage,
  upsertPose,
  type Difficulty,
  type Pose,
} from "@/lib/yoga-api";
import { resolveImage, useSignedImages } from "@/hooks/use-signed-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { useCategoryLabel } from "@/lib/i18n/categories";

const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pose?: Pose | null;
}

export function PoseFormDialog({ open, onOpenChange, pose }: Props) {
  const t = useT();
  const catLabel = useCategoryLabel();
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories"],
    queryFn: fetchSubcategories,
  });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags });

  const [name, setName] = useState("");
  const [sanskrit, setSanskrit] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(pose?.name ?? "");
    setSanskrit(pose?.sanskrit_name ?? "");
    setDescription(pose?.description ?? "");
    setDuration(pose?.duration_seconds ? String(pose.duration_seconds) : "");
    setDifficulty((pose?.difficulty as Difficulty) ?? "beginner");
    setImagePath(pose?.image_url ?? null);
    setCategoryIds(pose?.categories.map((c) => c.id) ?? []);
    setSubcategoryId(pose?.subcategory_id ?? null);
    setTagIds(pose?.tags.map((t) => t.id) ?? []);
    setNewTag("");
  }, [open, pose]);

  const { data: imgs } = useSignedImages([imagePath]);
  const imageUrl = resolveImage(imagePath, imgs);

  // Subcategories are scoped to the categories the pose belongs to.
  const availableSubcategories = useMemo(
    () => subcategories.filter((s) => categoryIds.includes(s.category_id)),
    [subcategories, categoryIds],
  );

  useEffect(() => {
    if (subcategoryId && !availableSubcategories.some((s) => s.id === subcategoryId)) {
      setSubcategoryId(null);
    }
  }, [availableSubcategories, subcategoryId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t("pose.nameRequired"));
      await upsertPose({
        id: pose?.id,
        name: name.trim(),
        sanskrit_name: sanskrit.trim() || null,
        description: description.trim() || null,
        duration_seconds: duration ? Number(duration) : null,
        difficulty,
        image_url: imagePath,
        is_favorite: pose?.is_favorite ?? false,
        subcategory_id: subcategoryId,
        categoryIds,
        tagIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["poses"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      toast.success(pose ? t("pose.updated") : t("pose.added"));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deletePose(pose!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["poses"] });
      toast.success(t("pose.deleted"));
      onOpenChange(false);
    },
  });

  const createTagMut = useMutation({
    mutationFn: (raw: string) => createTag(raw),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      setTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
      setNewTag("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const path = await uploadPoseImage(file);
      setImagePath(path);
    } catch (e: any) {
      toast.error(e.message ?? t("pose.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {pose ? t("pose.edit") : t("pose.new")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2 sm:grid-cols-[200px_1fr]">
          {/* Image */}
          <div>
            <div className="aspect-square overflow-hidden rounded-lg border border-line bg-surface">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-ink-subtle">
                  <Upload className="size-8" strokeWidth={1.5} />
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="size-3 animate-spin" /> : "Upload"}
              </Button>
              {imagePath && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setImagePath(null)}
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div>
              <Label>{t("pose.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>{t("pose.sanskrit")}</Label>
              <Input
                value={sanskrit}
                onChange={(e) => setSanskrit(e.target.value)}
                placeholder="e.g. Adho Mukha Svanasana"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("pose.duration")}</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <div>
                <Label>{t("pose.difficulty")}</Label>
                <Select
                  value={difficulty}
                  onValueChange={(v) => setDifficulty(v as Difficulty)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d} className="capitalize">
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("pose.notes")}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">{t("pose.categories")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const active = categoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setCategoryIds((prev) =>
                        active ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                      )
                    }
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (active
                        ? "border-ink bg-ink text-background"
                        : "border-line text-ink-muted hover:border-ink-muted")
                    }
                  >
                    {catLabel(c.name)}
                  </button>
                );
              })}
            </div>
          </div>

          {availableSubcategories.length > 0 && (
            <div>
              <Label className="mb-2 block">{t("pose.subcategory")}</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSubcategoryId(null)}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition-colors " +
                    (subcategoryId === null
                      ? "border-ink bg-ink text-background"
                      : "border-line text-ink-muted hover:border-ink-muted")
                  }
                >
                  None
                </button>
                {availableSubcategories.map((s) => {
                  const active = subcategoryId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSubcategoryId(active ? null : s.id)}
                      className={
                        "rounded-full border px-3 py-1 text-xs transition-colors " +
                        (active
                          ? "border-ink bg-ink text-background"
                          : "border-line text-ink-muted hover:border-ink-muted")
                      }
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <Label className="mb-2 block">{t("pose.tags")}</Label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const active = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setTagIds((prev) =>
                        active ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                      )
                    }
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (active
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-line text-ink-muted hover:border-ink-muted")
                    }
                  >
                    #{t.name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="new tag"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTag.trim()) {
                    e.preventDefault();
                    createTagMut.mutate(newTag);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => newTag.trim() && createTagMut.mutate(newTag)}
                disabled={!newTag.trim() || createTagMut.isPending}
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 flex-row justify-between sm:justify-between">
          <div>
            {pose && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(t("pose.deleteConfirm"))) remove.mutate();
                }}
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 size-3 animate-spin" />}
              Save pose
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
