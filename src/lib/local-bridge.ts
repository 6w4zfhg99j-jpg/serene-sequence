// Runtime bridge to the Electron main process (window.yoga).
// When present, all data operations go through SQLite + FS instead of Supabase.

import type {
  Category,
  Pose,
  Sequence,
  SequenceListItem,
  SequencePoseItem,
  Tag,
  Level,
  Difficulty,
} from "./yoga-api";

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
      categoryIds: string[];
      tagIds: string[];
    }): Promise<string>;
    toggleFavorite(id: string, next: boolean): Promise<void>;
    remove(id: string): Promise<void>;
  };
  categories: { list(): Promise<Category[]> };
  tags: {
    list(): Promise<Tag[]>;
    create(name: string): Promise<Tag>;
  };
  sequences: {
    list(): Promise<SequenceListItem[]>;
    get(id: string): Promise<Sequence>;
    create(input: {
      title: string;
      description?: string;
      level?: Level;
    }): Promise<string>;
    update(
      id: string,
      patch: { title?: string; description?: string | null; level?: Level },
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
  };
}

declare global {
  interface Window {
    yoga?: LocalBridge;
  }
}

export function localBridge(): LocalBridge | null {
  if (typeof window === "undefined") return null;
  return window.yoga ?? null;
}

export const isLocalMode = () => localBridge() !== null;
