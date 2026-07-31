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
export interface Subcategory {
  id: string;
  category_id: string;
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
export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
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
  /** Kept for backwards compatibility — mirrors the first entry of subcategory_ids. */
  subcategory_id: string | null;
  /** A pose can belong to several subcategories, across one or more categories. */
  subcategory_ids: string[];
  sort_order: number;
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
  folder_id: string | null;
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
  folder_id: string | null;
  pose_count: number;
  total_duration_seconds: number;
  tags: Tag[];
}

const POSE_SELECT = `
  id, name, sanskrit_name, description, duration_seconds, difficulty,
  image_url, is_favorite, created_at, updated_at, subcategory_id, sort_order,
  categories:pose_categories(category:categories(id,name,sort_order)),
  subs:pose_subcategories(subcategory_id),
  tags:pose_tags(tag:tags(id,name))
`;

function normalizePose(raw: any): Pose {
  const subcategory_ids: string[] = (raw.subs ?? [])
    .map((r: any) => r.subcategory_id)
    .filter(Boolean);
  if (raw.subcategory_id && !subcategory_ids.includes(raw.subcategory_id)) {
    subcategory_ids.unshift(raw.subcategory_id);
  }
  return {
    ...raw,
    sort_order: raw.sort_order ?? 0,
    subcategory_ids,
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

export async function fetchSubcategories(): Promise<Subcategory[]> {
  const local = localBridge();
  if (local) return local.subcategories.list();
  const { data, error } = await supabase
    .from("subcategories")
    .select("id, category_id, name, sort_order, poses(count)")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    id: s.id,
    category_id: s.category_id,
    name: s.name,
    sort_order: s.sort_order,
    pose_count: s.poses?.[0]?.count ?? 0,
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
    .order("sort_order")
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
  subcategoryIds: string[];
  categoryIds: string[];
  tagIds: string[];
}) {
  const local = localBridge();
  if (local) return local.poses.upsert(input);
  const { categoryIds, tagIds, subcategoryIds, id, ...rest } = input;
  const fields = { ...rest, subcategory_id: subcategoryIds[0] ?? null };
  let poseId = id;
  if (poseId) {
    const { error } = await supabase.from("poses").update(fields).eq("id", poseId);
    if (error) throw error;
  } else {
    const { data: maxRow } = await supabase
      .from("poses")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("poses")
      .insert({ ...fields, sort_order: (maxRow?.sort_order ?? -1) + 1 })
      .select("id")
      .single();
    if (error) throw error;
    poseId = data.id;
  }
  await supabase.from("pose_categories").delete().eq("pose_id", poseId);
  await supabase.from("pose_tags").delete().eq("pose_id", poseId);
  await supabase.from("pose_subcategories").delete().eq("pose_id", poseId);
  if (categoryIds.length) {
    await supabase
      .from("pose_categories")
      .insert(categoryIds.map((cid) => ({ pose_id: poseId!, category_id: cid })));
  }
  if (subcategoryIds.length) {
    await supabase
      .from("pose_subcategories")
      .insert(subcategoryIds.map((sid) => ({ pose_id: poseId!, subcategory_id: sid })));
  }
  if (tagIds.length) {
    await supabase
      .from("pose_tags")
      .insert(tagIds.map((tid) => ({ pose_id: poseId!, tag_id: tid })));
  }
  return poseId!;
}

/** Persists the manual library order. `orderedIds` is the full list, in order. */
export async function reorderPoses(orderedIds: string[]) {
  const local = localBridge();
  if (local) return local.poses.reorder(orderedIds);
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("poses").update({ sort_order: idx }).eq("id", id),
    ),
  );
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

// ---- Category management -----------------------------------------

export async function createCategory(name: string): Promise<Category> {
  const clean = name.trim();
  if (!clean) throw new Error("Empty category name");
  const local = localBridge();
  if (local) return local.categories.create(clean);
  const existing = await fetchCategories();
  const dupe = existing.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (dupe) return dupe;
  const sort_order = existing.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1;
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: clean, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Empty category name");
  const local = localBridge();
  if (local) return local.categories.update(id, clean);
  const { error } = await supabase.from("categories").update({ name: clean }).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const local = localBridge();
  if (local) return local.categories.remove(id);
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderCategories(orderedIds: string[]) {
  const local = localBridge();
  if (local) return local.categories.reorder(orderedIds);
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("categories").update({ sort_order: idx }).eq("id", id),
    ),
  );
}

// ---- Subcategory management --------------------------------------

export async function createSubcategory(
  categoryId: string,
  name: string,
): Promise<Subcategory> {
  const clean = name.trim();
  if (!clean) throw new Error("Empty subcategory name");
  const local = localBridge();
  if (local) return local.subcategories.create(categoryId, clean);
  const existing = await fetchSubcategories();
  const siblings = existing.filter((s) => s.category_id === categoryId);
  const dupe = siblings.find((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (dupe) return dupe;
  const sort_order = siblings.reduce((m, s) => Math.max(m, s.sort_order), -1) + 1;
  const { data, error } = await supabase
    .from("subcategories")
    .insert({ category_id: categoryId, name: clean, sort_order })
    .select("id, category_id, name, sort_order")
    .single();
  if (error) throw error;
  return data as Subcategory;
}

export async function updateSubcategory(id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Empty subcategory name");
  const local = localBridge();
  if (local) return local.subcategories.update(id, clean);
  const { error } = await supabase
    .from("subcategories")
    .update({ name: clean })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSubcategory(id: string) {
  const local = localBridge();
  if (local) return local.subcategories.remove(id);
  const { error } = await supabase.from("subcategories").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderSubcategories(orderedIds: string[]) {
  const local = localBridge();
  if (local) return local.subcategories.reorder(orderedIds);
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("subcategories").update({ sort_order: idx }).eq("id", id),
    ),
  );
}


// ---- Tag management ----------------------------------------------

export async function updateTag(id: string, name: string) {
  const clean = name.trim().replace(/^#/, "").toLowerCase();
  if (!clean) throw new Error("Empty tag");
  const local = localBridge();
  if (local) return local.tags.update(id, clean);
  const tags = await fetchTags();
  const clash = tags.find((t) => t.name === clean && t.id !== id);
  if (clash) return mergeTags(id, clash.id);
  const { error } = await supabase.from("tags").update({ name: clean }).eq("id", id);
  if (error) throw error;
}

export async function mergeTags(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  const local = localBridge();
  if (local) return local.tags.merge(sourceId, targetId);
  const { data: poseLinks } = await supabase
    .from("pose_tags")
    .select("pose_id")
    .eq("tag_id", sourceId);
  const { data: seqLinks } = await supabase
    .from("sequence_tags")
    .select("sequence_id")
    .eq("tag_id", sourceId);
  if (poseLinks?.length) {
    await supabase
      .from("pose_tags")
      .upsert(
        poseLinks.map((l: any) => ({ pose_id: l.pose_id, tag_id: targetId })),
        { onConflict: "pose_id,tag_id", ignoreDuplicates: true },
      );
  }
  if (seqLinks?.length) {
    await supabase
      .from("sequence_tags")
      .upsert(
        seqLinks.map((l: any) => ({ sequence_id: l.sequence_id, tag_id: targetId })),
        { onConflict: "sequence_id,tag_id", ignoreDuplicates: true },
      );
  }
  const { error } = await supabase.from("tags").delete().eq("id", sourceId);
  if (error) throw error;
}

export async function deleteTag(id: string) {
  const local = localBridge();
  if (local) return local.tags.remove(id);
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) throw error;
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
// Folders
// ------------------------------------------------------------------

export async function fetchFolders(): Promise<Folder[]> {
  const local = localBridge();
  if (local) return local.folders.list();
  const { data, error } = await supabase
    .from("folders")
    .select("id, name, parent_id, sort_order, sequences(count)")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    parent_id: f.parent_id,
    sort_order: f.sort_order,
    sequence_count: f.sequences?.[0]?.count ?? 0,
  }));
}

export async function createFolder(
  name: string,
  parentId: string | null = null,
): Promise<Folder> {
  const clean = name.trim();
  if (!clean) throw new Error("Empty folder name");
  const local = localBridge();
  if (local) return local.folders.create(clean, parentId);
  const { data, error } = await supabase
    .from("folders")
    .insert({ name: clean, parent_id: parentId })
    .select("id, name, parent_id, sort_order")
    .single();
  if (error) throw error;
  return { ...(data as any), sequence_count: 0 };
}

export async function renameFolder(id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Empty folder name");
  const local = localBridge();
  if (local) return local.folders.update(id, clean);
  const { error } = await supabase.from("folders").update({ name: clean }).eq("id", id);
  if (error) throw error;
}

/** Deletes the folder and any nested folders; their sequences return to the main area. */
export async function deleteFolder(id: string) {
  const local = localBridge();
  if (local) return local.folders.remove(id);
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw error;
}

export async function moveFolder(id: string, parentId: string | null) {
  const local = localBridge();
  if (local) return local.folders.move(id, parentId);
  const { error } = await supabase
    .from("folders")
    .update({ parent_id: parentId })
    .eq("id", id);
  if (error) throw error;
}

/** Move a sequence into a folder, or back to the main area with null. */
export async function moveSequenceToFolder(
  sequenceId: string,
  folderId: string | null,
) {
  return updateSequence(sequenceId, { folder_id: folderId });
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
      `id, title, description, level, created_at, updated_at, folder_id,
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
    folder_id: r.folder_id ?? null,
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
  folder_id?: string | null;
}): Promise<string> {
  const local = localBridge();
  if (local) return local.sequences.create(input);
  const { data, error } = await supabase
    .from("sequences")
    .insert({
      title: input.title,
      description: input.description ?? null,
      level: input.level ?? "all-levels",
      folder_id: input.folder_id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateSequence(
  id: string,
  patch: {
    title?: string;
    description?: string | null;
    level?: Level;
    folder_id?: string | null;
  },
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
    folder_id: src.folder_id ?? null,
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
