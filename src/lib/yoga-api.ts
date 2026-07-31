import { supabase } from "@/integrations/supabase/client";
import { localBridge } from "./local-bridge";

export type Difficulty = "beginner" | "intermediate" | "advanced";
export type Level = "all-levels" | "beginner" | "intermediate" | "advanced";

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  pose_count?: number;
}
export interface Tag {
  id: string;
  name: string;
  pose_count?: number;
  sequence_count?: number;
}

export interface Pose {
  id: string;
  name: string;
  sanskrit_name: string | null;
  description: string | null;
  duration_seconds: number | null;
  difficulty: Difficulty;
  image_url: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  categories: Category[];
  tags: Tag[];
}
export interface SequencePoseItem {
  id: string;
  sequence_id: string;
  pose_id: string;
  position: number;
  notes: string | null;
  duration_seconds: number | null;
  side: string | null;
  pose: Pose;
}
export interface Sequence {
  id: string;
  title: string;
  description: string | null;
  level: Level;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  items: SequencePoseItem[];
}
export interface SequenceListItem {
  id: string;
  title: string;
  description: string | null;
  level: Level;
  created_at: string;
  updated_at: string;
  pose_count: number;
  total_duration_seconds: number;
  tags: Tag[];
}

const POSE_SELECT = `
  id, name, sanskrit_name, description, duration_seconds, difficulty,
  image_url, is_favorite, created_at, updated_at,
  categories:pose_categories(category:categories(id,name,sort_order)),
  tags:pose_tags(tag:tags(id,name))
`;

function normalizePose(raw: any): Pose {
  return {
    ...raw,
    categories: (raw.categories ?? []).map((r: any) => r.category).filter(Boolean),
    tags: (raw.tags ?? []).map((r: any) => r.tag).filter(Boolean),
  } as Pose;
}

// ------------------------------------------------------------------
// Categories / Tags / Poses
// ------------------------------------------------------------------

export async function fetchCategories(): Promise<Category[]> {
  const local = localBridge();
  if (local) return local.categories.list();
  const { data, error } = await supabase
    .from("categories")
    .select("*, pose_categories(count)")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    sort_order: c.sort_order,
    pose_count: c.pose_categories?.[0]?.count ?? 0,
  }));
}

export async function fetchTags(): Promise<Tag[]> {
  const local = localBridge();
  if (local) return local.tags.list();
  const { data, error } = await supabase
    .from("tags")
    .select("*, pose_tags(count), sequence_tags(count)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    pose_count: t.pose_tags?.[0]?.count ?? 0,
    sequence_count: t.sequence_tags?.[0]?.count ?? 0,
  }));
}


export async function fetchPoses(): Promise<Pose[]> {
  const local = localBridge();
  if (local) return local.poses.list();
  const { data, error } = await supabase
    .from("poses")
    .select(POSE_SELECT)
    .order("name");
  if (error) throw error;
  return (data ?? []).map(normalizePose);
}

export async function upsertPose(input: {
  id?: string;
  name: string;
  sanskrit_name?: string | null;
  description?: string | null;
  duration_seconds?: number | null;
  difficulty: Difficulty;
  image_url?: string | null;
  is_favorite?: boolean;
  categoryIds: string[];
  tagIds: string[];
}) {
  const local = localBridge();
  if (local) return local.poses.upsert(input);
  const { categoryIds, tagIds, id, ...fields } = input;
  let poseId = id;
  if (poseId) {
    const { error } = await supabase.from("poses").update(fields).eq("id", poseId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("poses")
      .insert(fields)
      .select("id")
      .single();
    if (error) throw error;
    poseId = data.id;
  }
  await supabase.from("pose_categories").delete().eq("pose_id", poseId);
  await supabase.from("pose_tags").delete().eq("pose_id", poseId);
  if (categoryIds.length) {
    await supabase
      .from("pose_categories")
      .insert(categoryIds.map((cid) => ({ pose_id: poseId!, category_id: cid })));
  }
  if (tagIds.length) {
    await supabase
      .from("pose_tags")
      .insert(tagIds.map((tid) => ({ pose_id: poseId!, tag_id: tid })));
  }
  return poseId!;
}

export async function toggleFavorite(pose: Pose) {
  const local = localBridge();
  if (local) return local.poses.toggleFavorite(pose.id, !pose.is_favorite);
  const { error } = await supabase
    .from("poses")
    .update({ is_favorite: !pose.is_favorite })
    .eq("id", pose.id);
  if (error) throw error;
}

export async function deletePose(id: string) {
  const local = localBridge();
  if (local) return local.poses.remove(id);
  const { error } = await supabase.from("poses").delete().eq("id", id);
  if (error) throw error;
}

export async function createTag(name: string): Promise<Tag> {
  const local = localBridge();
  if (local) return local.tags.create(name);
  const trimmed = name.trim().replace(/^#/, "").toLowerCase();
  if (!trimmed) throw new Error("Empty tag");
  const { data, error } = await supabase
    .from("tags")
    .upsert({ name: trimmed }, { onConflict: "name" })
    .select()
    .single();
  if (error) throw error;
  return data as Tag;
}

// ------------------------------------------------------------------
// Images
// ------------------------------------------------------------------

export const IMAGES_BUCKET = "pose-images";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function uploadPoseImage(file: File): Promise<string> {
  const local = localBridge();
  if (local) {
    const b64 = await fileToBase64(file);
    return local.images.importBase64(file.name, b64);
  }
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, file, { cacheControl: "31536000", contentType: file.type });
  if (error) throw error;
  return path;
}

export async function getSignedImageUrls(paths: string[]): Promise<Record<string, string>> {
  // In local mode paths are already resolvable URIs (local://...) — resolveImage
  // shortcircuits them and never asks for a signed URL.
  if (localBridge()) return {};
  const uniques = Array.from(new Set(paths.filter(Boolean)));
  if (uniques.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .createSignedUrls(uniques, 60 * 60 * 24);
  if (error) throw error;
  const map: Record<string, string> = {};
  data?.forEach((row) => {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  });
  return map;
}

// ------------------------------------------------------------------
// Sequences
// ------------------------------------------------------------------

export async function fetchSequences(): Promise<SequenceListItem[]> {
  const local = localBridge();
  if (local) return local.sequences.list();
  const { data, error } = await supabase
    .from("sequences")
    .select(
      `id, title, description, level, created_at, updated_at,
       tags:sequence_tags(tag:tags(id,name)),
       items:sequence_poses(duration_seconds, pose:poses(duration_seconds))`,
    )
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    level: r.level,
    created_at: r.created_at,
    updated_at: r.updated_at,
    pose_count: r.items?.length ?? 0,
    total_duration_seconds: (r.items ?? []).reduce(
      (sum: number, it: any) =>
        sum + (it.duration_seconds ?? it.pose?.duration_seconds ?? 0),
      0,
    ),
    tags: (r.tags ?? []).map((t: any) => t.tag).filter(Boolean),
  }));
}

export async function fetchSequence(id: string): Promise<Sequence> {
  const local = localBridge();
  if (local) return local.sequences.get(id);
  const { data, error } = await supabase
    .from("sequences")
    .select(
      `*, tags:sequence_tags(tag:tags(id,name)),
       items:sequence_poses(id, sequence_id, pose_id, position, notes, duration_seconds, side,
         pose:poses(${POSE_SELECT}))`,
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    ...(data as any),
    tags: ((data as any).tags ?? []).map((t: any) => t.tag).filter(Boolean),
    items: ((data as any).items ?? [])
      .map((it: any) => ({ ...it, pose: normalizePose(it.pose) }))
      .sort((a: SequencePoseItem, b: SequencePoseItem) => a.position - b.position),
  } as Sequence;
}

export async function createSequence(input: {
  title: string;
  description?: string;
  level?: Level;
}): Promise<string> {
  const local = localBridge();
  if (local) return local.sequences.create(input);
  const { data, error } = await supabase
    .from("sequences")
    .insert({
      title: input.title,
      description: input.description ?? null,
      level: input.level ?? "all-levels",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateSequence(
  id: string,
  patch: { title?: string; description?: string | null; level?: Level },
) {
  const local = localBridge();
  if (local) return local.sequences.update(id, patch);
  const { error } = await supabase.from("sequences").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setSequenceTags(sequenceId: string, tagIds: string[]) {
  const local = localBridge();
  if (local) return local.sequences.setTags(sequenceId, tagIds);
  await supabase.from("sequence_tags").delete().eq("sequence_id", sequenceId);
  if (tagIds.length) {
    await supabase
      .from("sequence_tags")
      .insert(tagIds.map((tid) => ({ sequence_id: sequenceId, tag_id: tid })));
  }
}

export async function deleteSequence(id: string) {
  const local = localBridge();
  if (local) return local.sequences.remove(id);
  const { error } = await supabase.from("sequences").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateSequence(id: string): Promise<string> {
  const local = localBridge();
  if (local) return local.sequences.duplicate(id);
  const src = await fetchSequence(id);
  const newId = await createSequence({
    title: src.title + " (copy)",
    description: src.description ?? undefined,
    level: src.level,
  });
  if (src.tags.length) await setSequenceTags(newId, src.tags.map((t) => t.id));
  if (src.items.length) {
    await supabase.from("sequence_poses").insert(
      src.items.map((it, idx) => ({
        sequence_id: newId,
        pose_id: it.pose_id,
        position: idx,
        notes: it.notes,
        duration_seconds: it.duration_seconds,
        side: it.side,
      })),
    );
  }
  return newId;
}

export async function addPoseToSequence(sequenceId: string, poseId: string) {
  const local = localBridge();
  if (local) return local.sequences.addPose(sequenceId, poseId);
  const { data: last } = await supabase
    .from("sequence_poses")
    .select("position")
    .eq("sequence_id", sequenceId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = (last?.[0]?.position ?? -1) + 1;
  const { error } = await supabase
    .from("sequence_poses")
    .insert({ sequence_id: sequenceId, pose_id: poseId, position: nextPos });
  if (error) throw error;
}

export async function removeSequenceItem(itemId: string) {
  const local = localBridge();
  if (local) return local.sequences.removeItem(itemId);
  const { error } = await supabase.from("sequence_poses").delete().eq("id", itemId);
  if (error) throw error;
}

export async function duplicateSequenceItem(item: SequencePoseItem) {
  const local = localBridge();
  if (local) return local.sequences.duplicateItem(item);
  const { data: last } = await supabase
    .from("sequence_poses")
    .select("position")
    .eq("sequence_id", item.sequence_id)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = (last?.[0]?.position ?? -1) + 1;
  const { error } = await supabase.from("sequence_poses").insert({
    sequence_id: item.sequence_id,
    pose_id: item.pose_id,
    position: nextPos,
    notes: item.notes,
    duration_seconds: item.duration_seconds,
    side: item.side,
  });
  if (error) throw error;
}

export async function updateSequenceItem(
  itemId: string,
  patch: { notes?: string | null; duration_seconds?: number | null; side?: string | null },
) {
  const local = localBridge();
  if (local) return local.sequences.updateItem(itemId, patch);
  const { error } = await supabase.from("sequence_poses").update(patch).eq("id", itemId);
  if (error) throw error;
}

export async function reorderSequenceItems(sequenceId: string, orderedIds: string[]) {
  const local = localBridge();
  if (local) return local.sequences.reorder(sequenceId, orderedIds);
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("sequence_poses").update({ position: idx }).eq("id", id),
    ),
  );
  await supabase
    .from("sequences")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sequenceId);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}
