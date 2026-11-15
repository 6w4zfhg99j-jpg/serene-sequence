import type { LocalBridge } from "./local-bridge";
import type { Pose, Sequence, SequenceListItem } from "./yoga-api";
import { createBrowserStore, type BrowserSnapshot } from "./browser-store";

const store = createBrowserStore();
const now = () => new Date().toISOString();
const empty = (): BrowserSnapshot => ({ categories: [], subcategories: [], poses: [], tags: [], folders: [], sequences: [] });
let initialization: Promise<void> | undefined;

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Copy the existing read-only web library once; never write back to Cloud. */
export function initializeBrowserWorkspace(): Promise<void> {
  initialization ??= (async () => {
    if (await store.read()) return;
    const state = empty();
    if (navigator.onLine) {
      const { supabase } = await import("@/integrations/supabase/client");
      const results = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("subcategories").select("*").order("sort_order"),
        supabase.from("tags").select("*"),
        supabase.from("folders").select("*").order("sort_order"),
        supabase.from("poses").select("*, categories:pose_categories(category:categories(*)), subs:pose_subcategories(subcategory_id), tags:pose_tags(tag:tags(*))").order("sort_order"),
        supabase.from("sequences").select("*, items:sequence_poses(*), tags:sequence_tags(tag:tags(*))"),
      ]);
      const failure = results.find((r) => r.error)?.error;
      if (failure) throw failure;
      const [cats, subs, tags, folders, poses, sequences] = results;
      state.categories = cats.data ?? [];
      state.subcategories = subs.data ?? [];
      state.tags = tags.data ?? [];
      state.folders = folders.data ?? [];
      state.poses = (poses.data ?? []).map((p) => ({ ...p,
        difficulty: p.difficulty as Pose["difficulty"],
        categories: p.categories.flatMap((r) => r.category ? [r.category] : []),
        tags: p.tags.flatMap((r) => r.tag ? [r.tag] : []),
        subcategory_ids: [...new Set([...p.subs.map((r) => r.subcategory_id), ...(p.subcategory_id ? [p.subcategory_id] : [])])],
      }));
      await Promise.all(state.poses.map(async (pose) => {
        if (!pose.image_url || pose.image_url.startsWith("data:")) return;
        let url = pose.image_url;
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
          const { data, error } = await supabase.storage.from("pose-images").createSignedUrl(url, 60);
          if (error) throw error;
          url = data.signedUrl;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error("Image could not be copied locally");
        pose.image_url = await dataUrl(await response.blob());
      }));
      state.sequences = (sequences.data ?? []).map((s) => ({ ...s,
        level: s.level as Sequence["level"], practice_type: s.practice_type === "stretching" ? "stretching" : "yoga",
        tags: s.tags.flatMap((r) => r.tag ? [r.tag] : []),
        items: s.items.flatMap((it) => {
          const pose = state.poses.find((p) => p.id === it.pose_id);
          return pose ? [{ ...it, pose }] : [];
        }).sort((a, b) => a.position - b.position),
      }));
    }
    await store.initialize(state);
  })().catch((error) => { initialization = undefined; throw error; });
  return initialization;
}

function hydratePose(state: BrowserSnapshot, pose: Pose): Pose {
  return { ...pose,
    categories: state.categories.filter((c) => pose.categories.some((p) => p.id === c.id)),
    subcategory_ids: pose.subcategory_ids.filter((id) => state.subcategories.some((s) => s.id === id)),
    tags: state.tags.filter((t) => pose.tags.some((p) => p.id === t.id)),
  };
}
function sequence(state: BrowserSnapshot, id: string): Sequence {
  const found = state.sequences.find((s) => s.id === id);
  if (!found) throw new Error("Sequence not found");
  return found;
}
const trashed = (s: Sequence) => (s as Sequence & { deleted_at?: string | null }).deleted_at;
function listSequences(state: BrowserSnapshot, trash = false): SequenceListItem[] {
  return state.sequences.filter((s) => !!trashed(s) === trash && (!trashed(s) || Date.now() - Date.parse(trashed(s) ?? "") < 7 * 86400000))
    .map((s) => ({ ...s, pose_count: s.items.length, total_duration_seconds: 0 }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
async function read<T>(run: (state: BrowserSnapshot) => T): Promise<T> {
  await initializeBrowserWorkspace();
  const state = await store.read();
  if (!state) throw new Error("Local workspace is not ready");
  return run(state);
}
async function change<T>(run: (state: BrowserSnapshot) => T): Promise<T> {
  await initializeBrowserWorkspace();
  return store.change(run);
}
function changeItem(id: string, run: (s: Sequence, index: number) => void) {
  return change((state) => {
    for (const s of state.sequences) {
      const index = s.items.findIndex((i) => i.id === id);
      if (index >= 0) { run(s, index); s.updated_at = now(); return; }
    }
    throw new Error("Pose not found in sequence");
  });
}

export const browserLocalBridge: LocalBridge = {
  poses: {
    list: () => read((s) => s.poses.map((p) => hydratePose(s, p)).sort((a, b) => a.sort_order - b.sort_order)),
    upsert: (input) => change((s) => {
      const id = input.id ?? crypto.randomUUID();
      const existing = s.poses.find((p) => p.id === id);
      const pose: Pose = { ...input, id, sanskrit_name: input.sanskrit_name ?? null, description: input.description ?? null,
        duration_seconds: input.duration_seconds ?? null, image_url: input.image_url ?? null, is_favorite: input.is_favorite ?? false,
        created_at: existing?.created_at ?? now(), updated_at: now(), subcategory_id: input.subcategoryIds[0] ?? null,
        subcategory_ids: input.subcategoryIds, sort_order: existing?.sort_order ?? s.poses.length,
        categories: s.categories.filter((c) => input.categoryIds.includes(c.id)), tags: s.tags.filter((t) => input.tagIds.includes(t.id)) };
      s.poses = [...s.poses.filter((p) => p.id !== id), pose];
      return id;
    }),
    toggleFavorite: (id, next) => change((s) => { const p = s.poses.find((p) => p.id === id); if (p) p.is_favorite = next; }),
    remove: (id) => change((s) => { s.poses = s.poses.filter((p) => p.id !== id); s.sequences.forEach((q) => { q.items = q.items.filter((i) => i.pose_id !== id); }); }),
    reorder: (ids) => change((s) => { ids.forEach((id, i) => { const p = s.poses.find((p) => p.id === id); if (p) p.sort_order = i; }); }),
  },
  categories: {
    list: () => read((s) => s.categories.map((c) => ({ ...c, pose_count: s.poses.filter((p) => p.categories.some((x) => x.id === c.id)).length })).sort((a, b) => a.sort_order - b.sort_order)),
    create: (name, practice = "yoga") => change((s) => {
      const existing = s.categories.find((c) => c.name.toLowerCase() === name.trim().toLowerCase() && (c.practice_type ?? "yoga") === practice);
      if (existing) return existing;
      const category = { id: crypto.randomUUID(), name: name.trim(), sort_order: s.categories.filter((c) => c.practice_type === practice).length, practice_type: practice };
      s.categories.push(category); return category;
    }),
    update: (id, name) => change((s) => { const c = s.categories.find((c) => c.id === id); if (c) c.name = name.trim(); }),
    remove: (id) => change((s) => { s.categories = s.categories.filter((c) => c.id !== id); s.subcategories = s.subcategories.filter((c) => c.category_id !== id); }),
    reorder: (ids) => change((s) => { ids.forEach((id, i) => { const c = s.categories.find((c) => c.id === id); if (c) c.sort_order = i; }); }),
  },
  subcategories: {
    list: () => read((s) => s.subcategories.map((c) => ({ ...c, pose_count: s.poses.filter((p) => p.subcategory_ids.includes(c.id)).length }))),
    create: (category_id, name) => change((s) => {
      const existing = s.subcategories.find((c) => c.category_id === category_id && c.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) return existing;
      const sub = { id: crypto.randomUUID(), category_id, name: name.trim(), sort_order: s.subcategories.filter((c) => c.category_id === category_id).length };
      s.subcategories.push(sub); return sub;
    }),
    update: (id, name) => change((s) => { const c = s.subcategories.find((c) => c.id === id); if (c) c.name = name.trim(); }),
    remove: (id) => change((s) => { s.subcategories = s.subcategories.filter((c) => c.id !== id); }),
    reorder: (ids) => change((s) => { ids.forEach((id, i) => { const c = s.subcategories.find((c) => c.id === id); if (c) c.sort_order = i; }); }),
  },
  tags: {
    list: () => read((s) => s.tags),
    create: (raw) => change((s) => { const name = raw.trim().replace(/^#/, "").toLowerCase(); const existing = s.tags.find((t) => t.name === name); if (existing) return existing; const t = { id: crypto.randomUUID(), name }; s.tags.push(t); return t; }),
    update: (id, name) => change((s) => { const t = s.tags.find((t) => t.id === id); if (t) t.name = name.trim().replace(/^#/, "").toLowerCase(); }),
    merge: (source, target) => change((s) => { const tag = s.tags.find((t) => t.id === target); if (!tag) return; [...s.poses, ...s.sequences].forEach((p) => { if (p.tags.some((t) => t.id === source)) p.tags = [...p.tags.filter((t) => t.id !== source && t.id !== target), tag]; }); s.tags = s.tags.filter((t) => t.id !== source); }),
    remove: (id) => change((s) => { s.tags = s.tags.filter((t) => t.id !== id); [...s.poses, ...s.sequences].forEach((p) => { p.tags = p.tags.filter((t) => t.id !== id); }); }),
  },
  folders: {
    list: () => read((s) => s.folders),
    create: (name, parent_id) => change((s) => { const f = { id: crypto.randomUUID(), name: name.trim(), parent_id, sort_order: s.folders.length }; s.folders.push(f); return f; }),
    update: (id, name) => change((s) => { const f = s.folders.find((f) => f.id === id); if (f) f.name = name.trim(); }),
    remove: (id) => change((s) => { const ids = new Set([id]); for (let n = 0; n < s.folders.length; n++) s.folders.forEach((f) => { if (f.parent_id && ids.has(f.parent_id)) ids.add(f.id); }); s.folders = s.folders.filter((f) => !ids.has(f.id)); s.sequences.forEach((q) => { if (q.folder_id && ids.has(q.folder_id)) q.folder_id = null; }); }),
    move: (id, parent_id) => change((s) => { let cursor = parent_id; const visited = new Set([id]); while (cursor) { if (visited.has(cursor)) return; visited.add(cursor); cursor = s.folders.find((f) => f.id === cursor)?.parent_id ?? null; } const f = s.folders.find((f) => f.id === id); if (f) f.parent_id = parent_id; }),
    reorder: (ids) => change((s) => { ids.forEach((id, i) => { const f = s.folders.find((f) => f.id === id); if (f) f.sort_order = i; }); }),
  },
  sequences: {
    list: () => read((s) => listSequences(s)),
    listTrash: () => read((s) => listSequences(s, true)),
    get: (id) => read((s) => { const q = sequence(s, id); return { ...q, items: q.items.flatMap((it) => { const pose = s.poses.find((p) => p.id === it.pose_id); return pose ? [{ ...it, pose: hydratePose(s, pose) }] : []; }).sort((a, b) => a.position - b.position) }; }),
    create: (input) => change((s) => { const id = crypto.randomUUID(); s.sequences.push({ id, title: input.title, description: input.description ?? null, practice_notes: input.practice_notes ?? null, level: input.level ?? "all-levels", practice_type: input.practice_type ?? "yoga", folder_id: input.folder_id ?? null, created_at: now(), updated_at: now(), tags: [], items: [] }); return id; }),
    update: (id, patch) => change((s) => { Object.assign(sequence(s, id), patch, { updated_at: now() }); }),
    setTags: (id, ids) => change((s) => { sequence(s, id).tags = s.tags.filter((t) => ids.includes(t.id)); }),
    remove: (id) => change((s) => { Object.assign(sequence(s, id), { deleted_at: now() }); }),
    restore: (id) => change((s) => { Object.assign(sequence(s, id), { deleted_at: null }); }),
    purge: (id) => change((s) => { s.sequences = s.sequences.filter((q) => q.id !== id); }),
    emptyTrash: () => change((s) => { s.sequences = s.sequences.filter((q) => !trashed(q)); }),
    duplicate: (id) => change((s) => { const q = structuredClone(sequence(s, id)); const newId = crypto.randomUUID(); Object.assign(q, { id: newId, title: `${q.title} (copy)`, created_at: now(), updated_at: now(), deleted_at: null }); q.items = q.items.map((it) => ({ ...it, id: crypto.randomUUID(), sequence_id: newId })); s.sequences.push(q); return newId; }),
    addPose: (id, poseId) => change((s) => { const q = sequence(s, id); const pose = s.poses.find((p) => p.id === poseId); if (!pose) throw new Error("Pose not found"); q.items.push({ id: crypto.randomUUID(), sequence_id: id, pose_id: poseId, position: Math.max(-1, ...q.items.map((i) => i.position)) + 1, notes: null, duration_seconds: null, side: null, pose }); q.updated_at = now(); }),
    removeItem: (id) => changeItem(id, (s, index) => { s.items.splice(index, 1); }),
    duplicateItem: (item) => change((s) => { const q = sequence(s, item.sequence_id); q.items.push({ ...item, id: crypto.randomUUID(), position: Math.max(-1, ...q.items.map((i) => i.position)) + 1 }); q.updated_at = now(); }),
    updateItem: (id, patch) => changeItem(id, (s, index) => { Object.assign(s.items[index], patch); }),
    reorder: (id, ids) => change((s) => { const q = sequence(s, id); ids.forEach((id, position) => { const item = q.items.find((i) => i.id === id); if (item) item.position = position; }); q.updated_at = now(); }),
  },
  images: {
    importBase64: async (name, base64) => dataUrl(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : /\.gif$/i.test(name) ? "image/gif" : "image/jpeg" })),
    readDataUrl: async (ref) => ref.startsWith("data:") ? ref : dataUrl(await (await fetch(ref)).blob()),
  },
};