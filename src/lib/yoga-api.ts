import { localBridge } from "./local-bridge";
import type { PoseAssignment } from "./pose-assignment";

// No implicit Cloud fallback: core reads and writes always stay in this workspace.
function requireLocal() {
  const bridge = localBridge();
  if (!bridge) throw new Error("Local workspace is only available after the interface loads");
  return bridge;
}

export type Difficulty = "beginner" | "intermediate" | "advanced";
export type PracticeType = "yoga" | "stretching";
export type Level = "all-levels" | "beginner" | "intermediate" | "advanced";

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  practice_type?: PracticeType;
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
  practice_assignment?: PoseAssignment;
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
  practice_notes: string | null;
  level: Level;
  practice_type: PracticeType;
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
  practice_type: PracticeType;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  folder_id: string | null;
  pose_count: number;
  total_duration_seconds: number;
  tags: Tag[];
}

// ------------------------------------------------------------------
// Categories / Tags / Poses
// ------------------------------------------------------------------

export async function fetchCategories(): Promise<Category[]> {
  return requireLocal().categories.list();
}

export async function fetchSubcategories(): Promise<Subcategory[]> {
  return requireLocal().subcategories.list();
}

export async function fetchTags(): Promise<Tag[]> {
  return requireLocal().tags.list();
}


export async function fetchPoses(): Promise<Pose[]> {
  return requireLocal().poses.list();
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
  practice_assignment?: PoseAssignment;
  subcategoryIds: string[];
  categoryIds: string[];
  tagIds: string[];
}) {
  return requireLocal().poses.upsert(input);
}

/** Persists the manual library order. `orderedIds` is the full list, in order. */
export async function reorderPoses(orderedIds: string[]) {
  return requireLocal().poses.reorder(orderedIds);
}

export async function toggleFavorite(pose: Pose) {
  return requireLocal().poses.toggleFavorite(pose.id, !pose.is_favorite);
}

export async function deletePose(id: string) {
  return requireLocal().poses.remove(id);
}

export async function createTag(name: string): Promise<Tag> {
  const clean = name.trim().replace(/^#/, "").toLowerCase();
  if (!clean) throw new Error("Empty tag");
  return requireLocal().tags.create(clean);
}

// ---- Category management -----------------------------------------

export async function createCategory(name: string, practice: PracticeType = "yoga"): Promise<Category> {
  const clean = name.trim();
  if (!clean) throw new Error("Empty category name");
  return requireLocal().categories.create(clean, practice);
}

export async function updateCategory(id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Empty category name");
  return requireLocal().categories.update(id, clean);
}

export async function deleteCategory(id: string) {
  return requireLocal().categories.remove(id);
}

export async function reorderCategories(orderedIds: string[]) {
  return requireLocal().categories.reorder(orderedIds);
}

// ---- Subcategory management --------------------------------------

export async function createSubcategory(
  categoryId: string,
  name: string,
): Promise<Subcategory> {
  const clean = name.trim();
  if (!clean) throw new Error("Empty subcategory name");
  return requireLocal().subcategories.create(categoryId, clean);
}

export async function updateSubcategory(id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Empty subcategory name");
  return requireLocal().subcategories.update(id, clean);
}

export async function deleteSubcategory(id: string) {
  return requireLocal().subcategories.remove(id);
}

export async function reorderSubcategories(orderedIds: string[]) {
  return requireLocal().subcategories.reorder(orderedIds);
}


// ---- Tag management ----------------------------------------------

export async function updateTag(id: string, name: string) {
  const clean = name.trim().replace(/^#/, "").toLowerCase();
  if (!clean) throw new Error("Empty tag");
  return requireLocal().tags.update(id, clean);
}

export async function mergeTags(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  return requireLocal().tags.merge(sourceId, targetId);
}

export async function deleteTag(id: string) {
  return requireLocal().tags.remove(id);
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
  return requireLocal().images.importBase64(file.name, await fileToBase64(file));
}

export async function getSignedImageUrls(paths: string[]): Promise<Record<string, string>> {
  void paths;
  requireLocal();
  return {};
}

// ------------------------------------------------------------------
// Folders
// ------------------------------------------------------------------

export async function fetchFolders(): Promise<Folder[]> {
  return requireLocal().folders.list();
}

export async function createFolder(
  name: string,
  parentId: string | null = null,
): Promise<Folder> {
  const clean = name.trim();
  if (!clean) throw new Error("Empty folder name");
  return requireLocal().folders.create(clean, parentId);
}

export async function renameFolder(id: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Empty folder name");
  return requireLocal().folders.update(id, clean);
}

/** Deletes the folder and any nested folders; their sequences return to the main area. */
export async function deleteFolder(id: string) {
  return requireLocal().folders.remove(id);
}

export async function moveFolder(id: string, parentId: string | null) {
  return requireLocal().folders.move(id, parentId);
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
  return requireLocal().sequences.list();
}

export async function fetchSequence(id: string): Promise<Sequence> {
  return requireLocal().sequences.get(id);
}

export async function createSequence(input: {
  title: string;
  description?: string;
  practice_notes?: string | null;
  level?: Level;
  folder_id?: string | null;
  practice_type?: PracticeType;
}): Promise<string> {
  return requireLocal().sequences.create(input);
}

export async function updateSequence(
  id: string,
  patch: {
    title?: string;
    description?: string | null;
    practice_notes?: string | null;
    level?: Level;
    folder_id?: string | null;
    practice_type?: PracticeType;
  },
) {
  return requireLocal().sequences.update(id, patch);
}

export async function setSequenceTags(sequenceId: string, tagIds: string[]) {
  return requireLocal().sequences.setTags(sequenceId, tagIds);
}

/** Days a deleted sequence can still be restored from the Trash. */
export const TRASH_RETENTION_DAYS = 7;

/** Days left before a trashed sequence is purged automatically. */
export function trashDaysLeft(deletedAt: string | null | undefined): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS;
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86400000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

/** Soft delete — the sequence moves to the Trash for 7 days. */
export async function deleteSequence(id: string) {
  return requireLocal().sequences.remove(id);
}

/** Sequences currently in the Trash; expired ones are purged first. */
export async function fetchTrashedSequences(): Promise<SequenceListItem[]> {
  return requireLocal().sequences.listTrash?.() ?? [];
}

/** Restore a sequence out of the Trash. */
export async function restoreSequence(id: string) {
  return requireLocal().sequences.restore?.(id);
}

/** Delete a sequence for good. */
export async function purgeSequence(id: string) {
  return requireLocal().sequences.purge?.(id);
}

/** Empty the whole Trash. */
export async function emptyTrash() {
  return requireLocal().sequences.emptyTrash?.();
}

export async function duplicateSequence(id: string): Promise<string> {
  return requireLocal().sequences.duplicate(id);
}

export async function addPoseToSequence(sequenceId: string, poseId: string) {
  return requireLocal().sequences.addPose(sequenceId, poseId);
}

export async function removeSequenceItem(itemId: string) {
  return requireLocal().sequences.removeItem(itemId);
}

export async function duplicateSequenceItem(item: SequencePoseItem) {
  return requireLocal().sequences.duplicateItem(item);
}

export async function updateSequenceItem(
  itemId: string,
  patch: { notes?: string | null; duration_seconds?: number | null; side?: string | null },
) {
  return requireLocal().sequences.updateItem(itemId, patch);
}

export async function reorderSequenceItems(sequenceId: string, orderedIds: string[]) {
  return requireLocal().sequences.reorder(sequenceId, orderedIds);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}
