// electron/db.cjs — SQLite persistence for the local desktop mode.
const Database = require("better-sqlite3");
const { randomUUID } = require("crypto");

let db;

const DEFAULT_CATEGORIES = [
  "Warm-up",
  "Standing",
  "Balance",
  "Seated",
  "Backbend",
  "Forward Fold",
  "Twist",
  "Inversion",
  "Arm Balance",
  "Hip Opener",
  "Core",
  "Strength",
  "Stretching",
  "Restorative",
  "Pranayama",
  "Cool Down",
];

function init(dbPath) {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subcategories (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS poses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sanskrit_name TEXT,
      description TEXT,
      duration_seconds INTEGER,
      difficulty TEXT NOT NULL DEFAULT 'beginner',
      image_url TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pose_categories (
      pose_id TEXT NOT NULL REFERENCES poses(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (pose_id, category_id)
    );
    CREATE TABLE IF NOT EXISTS pose_tags (
      pose_id TEXT NOT NULL REFERENCES poses(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (pose_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      level TEXT NOT NULL DEFAULT 'all-levels',
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sequence_tags (
      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (sequence_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS sequence_poses (
      id TEXT PRIMARY KEY,
      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      pose_id TEXT NOT NULL REFERENCES poses(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      notes TEXT,
      duration_seconds INTEGER,
      side TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_seqposes_seq ON sequence_poses(sequence_id, position);
    CREATE INDEX IF NOT EXISTS idx_subcats_cat ON subcategories(category_id, sort_order);
  `);

  // Migration for databases created before subcategories existed.
  const poseCols = db.prepare("PRAGMA table_info(poses)").all().map((c) => c.name);
  if (!poseCols.includes("subcategory_id")) {
    db.exec("ALTER TABLE poses ADD COLUMN subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL");
  }

  // Migration for databases created before folders existed.
  const seqCols = db.prepare("PRAGMA table_info(sequences)").all().map((c) => c.name);
  if (!seqCols.includes("folder_id")) {
    db.exec("ALTER TABLE sequences ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_sequences_folder ON sequences(folder_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)");

  const catCount = db.prepare("SELECT COUNT(*) AS n FROM categories").get().n;
  if (catCount === 0) {
    const ins = db.prepare(
      "INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)",
    );
    DEFAULT_CATEGORIES.forEach((name, i) => ins.run(randomUUID(), name, i));
  }
}

const now = () => new Date().toISOString();
const bool = (v) => (v ? 1 : 0);
const unbool = (v) => !!v;

function poseRow(row) {
  return {
    id: row.id,
    name: row.name,
    sanskrit_name: row.sanskrit_name,
    description: row.description,
    duration_seconds: row.duration_seconds,
    difficulty: row.difficulty,
    image_url: row.image_url,
    is_favorite: unbool(row.is_favorite),
    subcategory_id: row.subcategory_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    categories: [],
    tags: [],
  };
}

function hydratePoseCategoriesTags(poses) {
  if (poses.length === 0) return poses;
  const ids = poses.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const cats = db
    .prepare(
      `SELECT pc.pose_id, c.id, c.name, c.sort_order
       FROM pose_categories pc JOIN categories c ON c.id = pc.category_id
       WHERE pc.pose_id IN (${placeholders})`,
    )
    .all(...ids);
  const tags = db
    .prepare(
      `SELECT pt.pose_id, t.id, t.name
       FROM pose_tags pt JOIN tags t ON t.id = pt.tag_id
       WHERE pt.pose_id IN (${placeholders})`,
    )
    .all(...ids);
  const byId = new Map(poses.map((p) => [p.id, p]));
  for (const r of cats) {
    byId.get(r.pose_id).categories.push({
      id: r.id,
      name: r.name,
      sort_order: r.sort_order,
    });
  }
  for (const r of tags) {
    byId.get(r.pose_id).tags.push({ id: r.id, name: r.name });
  }
  return poses;
}

// ---------- Categories / Tags ----------

function listCategories() {
  return db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM pose_categories pc WHERE pc.category_id = c.id) AS pose_count
       FROM categories c ORDER BY c.sort_order, c.name`,
    )
    .all();
}

function createCategory(rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) throw new Error("Empty category name");
  const existing = db
    .prepare("SELECT * FROM categories WHERE lower(name) = lower(?)")
    .get(name);
  if (existing) return existing;
  const max = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories").get().m;
  const id = randomUUID();
  db.prepare("INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)").run(
    id,
    name,
    max + 1,
  );
  return { id, name, sort_order: max + 1 };
}

function updateCategory(id, name) {
  const clean = String(name ?? "").trim();
  if (!clean) throw new Error("Empty category name");
  db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(clean, id);
}

function deleteCategory(id) {
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

// ---------- Subcategories ----------

function listSubcategories() {
  return db
    .prepare(
      `SELECT s.id, s.category_id, s.name, s.sort_order,
        (SELECT COUNT(*) FROM poses p WHERE p.subcategory_id = s.id) AS pose_count
       FROM subcategories s ORDER BY s.sort_order, s.name`,
    )
    .all();
}

function createSubcategory(categoryId, rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) throw new Error("Empty subcategory name");
  const existing = db
    .prepare(
      "SELECT * FROM subcategories WHERE category_id = ? AND lower(name) = lower(?)",
    )
    .get(categoryId, name);
  if (existing) return existing;
  const max = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM subcategories WHERE category_id = ?",
    )
    .get(categoryId).m;
  const id = randomUUID();
  db.prepare(
    "INSERT INTO subcategories (id, category_id, name, sort_order) VALUES (?, ?, ?, ?)",
  ).run(id, categoryId, name, max + 1);
  return { id, category_id: categoryId, name, sort_order: max + 1 };
}

function updateSubcategory(id, name) {
  const clean = String(name ?? "").trim();
  if (!clean) throw new Error("Empty subcategory name");
  db.prepare("UPDATE subcategories SET name = ? WHERE id = ?").run(clean, id);
}

function deleteSubcategory(id) {
  db.prepare("UPDATE poses SET subcategory_id = NULL WHERE subcategory_id = ?").run(id);
  db.prepare("DELETE FROM subcategories WHERE id = ?").run(id);
}

function reorderSubcategories(orderedIds) {
  const upd = db.prepare("UPDATE subcategories SET sort_order = ? WHERE id = ?");
  const tx = db.transaction((ids) => ids.forEach((sid, i) => upd.run(i, sid)));
  tx(orderedIds);
}

function reorderCategories(orderedIds) {
  const upd = db.prepare("UPDATE categories SET sort_order = ? WHERE id = ?");
  const tx = db.transaction((ids) => ids.forEach((cid, i) => upd.run(i, cid)));
  tx(orderedIds);
}

function listTags() {
  return db
    .prepare(
      `SELECT t.id, t.name,
        (SELECT COUNT(*) FROM pose_tags pt WHERE pt.tag_id = t.id) AS pose_count,
        (SELECT COUNT(*) FROM sequence_tags st WHERE st.tag_id = t.id) AS sequence_count
       FROM tags t ORDER BY t.name`,
    )
    .all();
}

function normalizeTagName(raw) {
  return String(raw ?? "").trim().replace(/^#/, "").toLowerCase();
}

function createTag(rawName) {
  const name = normalizeTagName(rawName);
  if (!name) throw new Error("Empty tag");
  const existing = db.prepare("SELECT id, name FROM tags WHERE name = ?").get(name);
  if (existing) return existing;
  const id = randomUUID();
  db.prepare("INSERT INTO tags (id, name) VALUES (?, ?)").run(id, name);
  return { id, name };
}

/** Rename a tag; if the new name already exists, merge into that tag. */
function updateTag(id, rawName) {
  const name = normalizeTagName(rawName);
  if (!name) throw new Error("Empty tag");
  const clash = db.prepare("SELECT id FROM tags WHERE name = ? AND id != ?").get(name, id);
  if (clash) return mergeTags(id, clash.id);
  db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(name, id);
  return id;
}

/** Move all usages of sourceId onto targetId, then delete sourceId. */
function mergeTags(sourceId, targetId) {
  if (sourceId === targetId) return targetId;
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO pose_tags (pose_id, tag_id)
       SELECT pose_id, ? FROM pose_tags WHERE tag_id = ?`,
    ).run(targetId, sourceId);
    db.prepare(
      `INSERT OR IGNORE INTO sequence_tags (sequence_id, tag_id)
       SELECT sequence_id, ? FROM sequence_tags WHERE tag_id = ?`,
    ).run(targetId, sourceId);
    db.prepare("DELETE FROM tags WHERE id = ?").run(sourceId);
  });
  tx();
  return targetId;
}

function deleteTag(id) {
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
}


// ---------- Poses ----------

function listPoses() {
  const rows = db.prepare("SELECT * FROM poses ORDER BY name").all().map(poseRow);
  return hydratePoseCategoriesTags(rows);
}

function upsertPose(input) {
  const id = input.id ?? randomUUID();
  const existing = input.id
    ? db.prepare("SELECT id FROM poses WHERE id = ?").get(id)
    : null;
  if (existing) {
    db.prepare(
      `UPDATE poses SET
        name = ?, sanskrit_name = ?, description = ?, duration_seconds = ?,
        difficulty = ?, image_url = ?, is_favorite = ?, subcategory_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.name,
      input.sanskrit_name ?? null,
      input.description ?? null,
      input.duration_seconds ?? null,
      input.difficulty,
      input.image_url ?? null,
      bool(input.is_favorite),
      input.subcategory_id ?? null,
      now(),
      id,
    );
  } else {
    db.prepare(
      `INSERT INTO poses (id, name, sanskrit_name, description, duration_seconds,
        difficulty, image_url, is_favorite, subcategory_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.sanskrit_name ?? null,
      input.description ?? null,
      input.duration_seconds ?? null,
      input.difficulty,
      input.image_url ?? null,
      bool(input.is_favorite),
      input.subcategory_id ?? null,
      now(),
      now(),
    );
  }
  db.prepare("DELETE FROM pose_categories WHERE pose_id = ?").run(id);
  db.prepare("DELETE FROM pose_tags WHERE pose_id = ?").run(id);
  const insCat = db.prepare(
    "INSERT INTO pose_categories (pose_id, category_id) VALUES (?, ?)",
  );
  for (const cid of input.categoryIds ?? []) insCat.run(id, cid);
  const insTag = db.prepare("INSERT INTO pose_tags (pose_id, tag_id) VALUES (?, ?)");
  for (const tid of input.tagIds ?? []) insTag.run(id, tid);
  return id;
}

function toggleFavorite(id, next) {
  db.prepare("UPDATE poses SET is_favorite = ?, updated_at = ? WHERE id = ?").run(
    bool(next),
    now(),
    id,
  );
}

function removePose(id) {
  db.prepare("DELETE FROM poses WHERE id = ?").run(id);
}

// ---------- Folders ----------

function listFolders() {
  return db
    .prepare(
      `SELECT f.id, f.name, f.parent_id, f.sort_order, f.created_at, f.updated_at,
        (SELECT COUNT(*) FROM sequences s WHERE s.folder_id = f.id) AS sequence_count
       FROM folders f ORDER BY f.sort_order, f.name`,
    )
    .all();
}

function createFolder(rawName, parentId = null) {
  const name = String(rawName ?? "").trim();
  if (!name) throw new Error("Empty folder name");
  const max = db
    .prepare(
      parentId
        ? "SELECT COALESCE(MAX(sort_order), -1) AS m FROM folders WHERE parent_id = ?"
        : "SELECT COALESCE(MAX(sort_order), -1) AS m FROM folders WHERE parent_id IS NULL",
    )
    .get(...(parentId ? [parentId] : [])).m;
  const id = randomUUID();
  db.prepare(
    "INSERT INTO folders (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)",
  ).run(id, name, parentId ?? null, max + 1);
  return { id, name, parent_id: parentId ?? null, sort_order: max + 1, sequence_count: 0 };
}

function updateFolder(id, name) {
  const clean = String(name ?? "").trim();
  if (!clean) throw new Error("Empty folder name");
  db.prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?").run(
    clean,
    now(),
    id,
  );
}

/** Delete a folder (and nested folders); their sequences fall back to the main area. */
function deleteFolder(id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    const kids = db
      .prepare("SELECT id FROM folders WHERE parent_id = ?")
      .all(ids[i])
      .map((r) => r.id);
    ids.push(...kids);
  }
  const placeholders = ids.map(() => "?").join(",");
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE sequences SET folder_id = NULL WHERE folder_id IN (${placeholders})`,
    ).run(...ids);
    db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`).run(...ids);
  });
  tx();
}

function moveFolder(id, parentId) {
  if (id === parentId) return;
  // Guard against moving a folder inside one of its own descendants.
  let cursor = parentId;
  while (cursor) {
    if (cursor === id) return;
    cursor =
      db.prepare("SELECT parent_id FROM folders WHERE id = ?").get(cursor)
        ?.parent_id ?? null;
  }
  db.prepare("UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?").run(
    parentId ?? null,
    now(),
    id,
  );
}

function reorderFolders(orderedIds) {
  const upd = db.prepare("UPDATE folders SET sort_order = ? WHERE id = ?");
  const tx = db.transaction((ids) => ids.forEach((fid, i) => upd.run(i, fid)));
  tx(orderedIds);
}

// ---------- Sequences ----------

function seqTags(sequenceId) {
  return db
    .prepare(
      `SELECT t.id, t.name FROM sequence_tags st JOIN tags t ON t.id = st.tag_id
       WHERE st.sequence_id = ? ORDER BY t.name`,
    )
    .all(sequenceId);
}

function listSequences() {
  const seqs = db.prepare("SELECT * FROM sequences ORDER BY updated_at DESC").all();
  const items = db
    .prepare(
      `SELECT sp.sequence_id, sp.duration_seconds AS override, p.duration_seconds AS pose_dur
       FROM sequence_poses sp JOIN poses p ON p.id = sp.pose_id`,
    )
    .all();
  return seqs.map((s) => {
    const its = items.filter((i) => i.sequence_id === s.id);
    return {
      id: s.id,
      title: s.title,
      description: s.description,
      level: s.level,
      created_at: s.created_at,
      updated_at: s.updated_at,
      folder_id: s.folder_id ?? null,
      pose_count: its.length,
      total_duration_seconds: its.reduce(
        (acc, i) => acc + (i.override ?? i.pose_dur ?? 0),
        0,
      ),
      tags: seqTags(s.id),
    };
  });
}

function getSequence(id) {
  const s = db.prepare("SELECT * FROM sequences WHERE id = ?").get(id);
  if (!s) throw new Error("Sequence not found");
  const itemRows = db
    .prepare(
      "SELECT * FROM sequence_poses WHERE sequence_id = ? ORDER BY position",
    )
    .all(id);
  const poseIds = itemRows.map((i) => i.pose_id);
  const posesById = new Map();
  if (poseIds.length) {
    const placeholders = poseIds.map(() => "?").join(",");
    const poses = db
      .prepare(`SELECT * FROM poses WHERE id IN (${placeholders})`)
      .all(...poseIds)
      .map(poseRow);
    hydratePoseCategoriesTags(poses);
    for (const p of poses) posesById.set(p.id, p);
  }
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    level: s.level,
    created_at: s.created_at,
    updated_at: s.updated_at,
    folder_id: s.folder_id ?? null,
    tags: seqTags(s.id),
    items: itemRows.map((it) => ({
      id: it.id,
      sequence_id: it.sequence_id,
      pose_id: it.pose_id,
      position: it.position,
      notes: it.notes,
      duration_seconds: it.duration_seconds,
      side: it.side,
      pose: posesById.get(it.pose_id),
    })),
  };
}

function createSequence(input) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO sequences (id, title, description, level, folder_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.title,
    input.description ?? null,
    input.level ?? "all-levels",
    input.folder_id ?? null,
    now(),
    now(),
  );
  return id;
}

function updateSequence(id, patch) {
  const fields = [];
  const values = [];
  for (const k of ["title", "description", "level", "folder_id"]) {
    if (k in patch) {
      fields.push(`${k} = ?`);
      values.push(patch[k]);
    }
  }
  fields.push("updated_at = ?");
  values.push(now());
  values.push(id);
  db.prepare(`UPDATE sequences SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

function setSequenceTags(sequenceId, tagIds) {
  db.prepare("DELETE FROM sequence_tags WHERE sequence_id = ?").run(sequenceId);
  const ins = db.prepare(
    "INSERT INTO sequence_tags (sequence_id, tag_id) VALUES (?, ?)",
  );
  for (const tid of tagIds) ins.run(sequenceId, tid);
}

function deleteSequence(id) {
  db.prepare("DELETE FROM sequences WHERE id = ?").run(id);
}

function duplicateSequence(id) {
  const src = getSequence(id);
  const newId = createSequence({
    title: src.title + " (copy)",
    description: src.description,
    level: src.level,
    folder_id: src.folder_id ?? null,
  });
  if (src.tags.length) setSequenceTags(newId, src.tags.map((t) => t.id));
  const ins = db.prepare(
    `INSERT INTO sequence_poses (id, sequence_id, pose_id, position, notes, duration_seconds, side)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  src.items.forEach((it, idx) => {
    ins.run(randomUUID(), newId, it.pose_id, idx, it.notes, it.duration_seconds, it.side);
  });
  return newId;
}

function nextPosition(sequenceId) {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(position), -1) AS m FROM sequence_poses WHERE sequence_id = ?",
    )
    .get(sequenceId);
  return row.m + 1;
}

function addPoseToSequence(sequenceId, poseId) {
  db.prepare(
    `INSERT INTO sequence_poses (id, sequence_id, pose_id, position) VALUES (?, ?, ?, ?)`,
  ).run(randomUUID(), sequenceId, poseId, nextPosition(sequenceId));
  db.prepare("UPDATE sequences SET updated_at = ? WHERE id = ?").run(now(), sequenceId);
}

function removeSequenceItem(itemId) {
  db.prepare("DELETE FROM sequence_poses WHERE id = ?").run(itemId);
}

function duplicateSequenceItem(item) {
  db.prepare(
    `INSERT INTO sequence_poses (id, sequence_id, pose_id, position, notes, duration_seconds, side)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    item.sequence_id,
    item.pose_id,
    nextPosition(item.sequence_id),
    item.notes,
    item.duration_seconds,
    item.side,
  );
}

function updateSequenceItem(itemId, patch) {
  const fields = [];
  const values = [];
  for (const k of ["notes", "duration_seconds", "side"]) {
    if (k in patch) {
      fields.push(`${k} = ?`);
      values.push(patch[k]);
    }
  }
  if (!fields.length) return;
  values.push(itemId);
  db.prepare(`UPDATE sequence_poses SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values,
  );
}

function reorderSequenceItems(sequenceId, orderedIds) {
  const upd = db.prepare("UPDATE sequence_poses SET position = ? WHERE id = ?");
  const tx = db.transaction((ids) => {
    ids.forEach((id, i) => upd.run(i, id));
    db.prepare("UPDATE sequences SET updated_at = ? WHERE id = ?").run(now(), sequenceId);
  });
  tx(orderedIds);
}

module.exports = {
  init,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  reorderSubcategories,
  listTags,
  createTag,
  updateTag,
  mergeTags,
  deleteTag,

  listPoses,
  upsertPose,
  toggleFavorite,
  removePose,
  listSequences,
  getSequence,
  createSequence,
  updateSequence,
  setSequenceTags,
  deleteSequence,
  duplicateSequence,
  addPoseToSequence,
  removeSequenceItem,
  duplicateSequenceItem,
  updateSequenceItem,
  reorderSequenceItems,
};
