import type { Category, Folder, Pose, Sequence, Subcategory, Tag } from "./yoga-api";
import { DEFAULT_CATEGORY_NAMES } from "./practice-library";

export interface BrowserSnapshot {
  categories: Category[];
  subcategories: Subcategory[];
  poses: Pose[];
  tags: Tag[];
  folders: Folder[];
  sequences: Sequence[];
}

export function prepareLocalLibrary(snapshot: BrowserSnapshot): BrowserSnapshot {
  const state = structuredClone(snapshot);
  if (!state.categories.length) {
    state.categories = DEFAULT_CATEGORY_NAMES.map((name, sort_order) => ({ id: crypto.randomUUID(), name, sort_order, practice_type: "yoga" }));
  }
  state.categories.forEach((c) => { c.practice_type ??= "yoga"; });
  if (!state.categories.some((c) => c.practice_type === "stretching")) {
    const originals = [...state.categories];
    const subs = [...state.subcategories];
    for (const category of originals) {
      const id = `stretching:${category.id}`;
      state.categories.push({ ...category, id, practice_type: "stretching" });
      const categorySubs = subs.filter((s) => s.category_id === category.id);
      state.subcategories.push(...categorySubs.map((s) => ({ ...s, id: `stretching:${s.id}`, category_id: id })));
      for (const pose of state.poses) {
        if (pose.categories.some((c) => c.id === category.id)) pose.categories.push({ ...category, id, practice_type: "stretching" });
        for (const sub of categorySubs) {
          if (pose.subcategory_ids.includes(sub.id)) pose.subcategory_ids.push(`stretching:${sub.id}`);
        }
      }
    }
  }
  state.sequences.forEach((s) => { s.practice_type ??= "yoga"; });
  return state;
}

export function createBrowserStore(name = "vona.personal.v1") {
  let connection: Promise<IDBDatabase> | undefined;
  function open() {
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("workspace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return connection;
  }
  async function transact<T>(mode: IDBTransactionMode, run: (state: BrowserSnapshot | undefined, store: IDBObjectStore) => T): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("workspace", mode);
      const store = tx.objectStore("workspace");
      const request = store.get("state");
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try { result = run(request.result, store); }
        catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error);
    });
  }
  return {
    read: () => transact("readonly", (state) => state),
    initialize: (snapshot: BrowserSnapshot) => transact("readwrite", (state, store) => {
      if (!state) store.put(prepareLocalLibrary(snapshot), "state");
    }),
    change: <T,>(run: (state: BrowserSnapshot) => T) => transact("readwrite", (state, store) => {
      if (!state) throw new Error("Local workspace is not ready");
      const result = run(state);
      store.put(state, "state");
      return result;
    }),
  };
}