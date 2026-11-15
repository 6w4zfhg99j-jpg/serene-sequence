// Runtime bridge to the Electron main process (window.yoga).
// Core data operations always use SQLite + FS or browser IndexedDB.

import type {
  Category,
  Folder,
  Pose,
  Sequence,
  SequenceListItem,
  SequencePoseItem,
  Subcategory,
  Tag,
  Level,
  Difficulty,
  PracticeType,
} from "./yoga-api";
import { browserLocalBridge } from "./browser-local";

export interface LocalBridge {
  poses: {
    list(): Promise<Pose[]>;
    upsert(input: {
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
    }): Promise<string>;
    toggleFavorite(id: string, next: boolean): Promise<void>;
    remove(id: string): Promise<void>;
    reorder(orderedIds: string[]): Promise<void>;
  };
  categories: {
    list(): Promise<Category[]>;
    create(name: string, practice?: PracticeType): Promise<Category>;
    update(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>;
    reorder(ids: string[]): Promise<void>;
  };
  subcategories: {
    list(): Promise<Subcategory[]>;
    create(categoryId: string, name: string): Promise<Subcategory>;
    update(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>;
    reorder(ids: string[]): Promise<void>;
  };
  tags: {
    list(): Promise<Tag[]>;
    create(name: string): Promise<Tag>;
    update(id: string, name: string): Promise<void>;
    merge(sourceId: string, targetId: string): Promise<void>;
    remove(id: string): Promise<void>;
  };

  folders: {
    list(): Promise<Folder[]>;
    create(name: string, parentId: string | null): Promise<Folder>;
    update(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>;
    move(id: string, parentId: string | null): Promise<void>;
    reorder(ids: string[]): Promise<void>;
  };

  sequences: {
    list(): Promise<SequenceListItem[]>;
    listTrash?(): Promise<SequenceListItem[]>;
    restore?(id: string): Promise<void>;
    purge?(id: string): Promise<void>;
    emptyTrash?(): Promise<void>;
    get(id: string): Promise<Sequence>;
    create(input: {
      title: string;
      description?: string;
      practice_notes?: string | null;
      level?: Level;
      folder_id?: string | null;
      practice_type?: "yoga" | "stretching";
    }): Promise<string>;
    update(
      id: string,
      patch: {
        title?: string;
        description?: string | null;
        practice_notes?: string | null;
        level?: Level;
        folder_id?: string | null;
        practice_type?: "yoga" | "stretching";
      },
    ): Promise<void>;
    setTags(id: string, tagIds: string[]): Promise<void>;
    remove(id: string): Promise<void>;
    duplicate(id: string): Promise<string>;
    addPose(sequenceId: string, poseId: string): Promise<void>;
    removeItem(itemId: string): Promise<void>;
    duplicateItem(item: SequencePoseItem): Promise<void>;
    updateItem(
      itemId: string,
      patch: {
        notes?: string | null;
        duration_seconds?: number | null;
        side?: string | null;
      },
    ): Promise<void>;
    reorder(sequenceId: string, orderedIds: string[]): Promise<void>;
  };
  images: {
    /** Copy a picked file (via base64) into the local images/ folder. */
    importBase64(name: string, base64: string): Promise<string>;
    /** Read a stored image off disk as a data URL (used by PDF export). */
    readDataUrl?(ref: string): Promise<string>;
  };
}

declare global {
  interface Window {
    yoga?: LocalBridge;
  }
}

export function localBridge(): LocalBridge | null {
  if (typeof window === "undefined") return null;
  if (window.yoga) return window.yoga;
  // A broken preload must never silently open a different, empty workspace.
  if (window.location.protocol === "app:" || /Electron\//.test(window.navigator.userAgent)) {
    throw new Error("The VONA desktop storage bridge is unavailable. Please reinstall VONA without removing its application data.");
  }
  return browserLocalBridge;
}

export const isLocalMode = () => localBridge() !== null;
