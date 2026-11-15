const fs = require("node:fs");
const library = require("./library.json");

/** One atomic import of bundled content; existing rows always win. */
function seedLibrary(db) {
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
  if (db.prepare("SELECT value FROM app_meta WHERE key = 'bundled_library_v1'").get()) return;
  db.transaction(() => {
    const categoryIds = new Map();
    const insertedPoses = [];
    for (const category of library.categories) {
      const existing = db.prepare("SELECT id FROM categories WHERE id = ? OR (name = ? AND practice_type = 'yoga') ORDER BY id = ? DESC LIMIT 1").get(category.id, category.name, category.id);
      const id = existing?.id ?? category.id;
      categoryIds.set(category.id, id);
      db.prepare("INSERT OR IGNORE INTO categories (id, name, sort_order, practice_type) VALUES (?, ?, ?, 'yoga')").run(id, category.name, category.sort_order);
    }
    for (const tag of library.tags) db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)").run(tag.id, tag.name);
    for (const sub of library.subcategories) {
      db.prepare("INSERT OR IGNORE INTO subcategories (id, category_id, name, sort_order) VALUES (?, ?, ?, ?)").run(sub.id, categoryIds.get(sub.category_id), sub.name, sub.sort_order);
    }
    for (const pose of library.poses) {
      // Do not restore deleted seed poses on subsequent launches or overwrite edits.
      if (db.prepare("SELECT id FROM poses WHERE id = ?").get(pose.id)) continue;
      insertedPoses.push(pose.id);
      db.prepare("INSERT INTO poses (id, name, sanskrit_name, description, difficulty, image_url, is_favorite, subcategory_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(pose.id, pose.name, pose.sanskrit_name, pose.description, pose.difficulty, pose.image_url, pose.is_favorite ? 1 : 0, pose.subcategory_id, pose.sort_order, pose.created_at, pose.updated_at);
      for (const link of library.pose_categories.filter((link) => link.pose_id === pose.id)) db.prepare("INSERT OR IGNORE INTO pose_categories (pose_id, category_id) VALUES (?, ?)").run(pose.id, categoryIds.get(link.category_id));
      for (const link of library.pose_subcategories.filter((link) => link.pose_id === pose.id)) db.prepare("INSERT OR IGNORE INTO pose_subcategories (pose_id, subcategory_id) VALUES (?, ?)").run(pose.id, link.subcategory_id);
      for (const link of library.pose_tags.filter((link) => link.pose_id === pose.id)) db.prepare("INSERT OR IGNORE INTO pose_tags (pose_id, tag_id) VALUES (?, ?)").run(pose.id, link.tag_id);
    }
    // Existing independently organized Stretching categories remain untouched.
    if (db.prepare("SELECT value FROM app_meta WHERE key = 'stretching_categories_v1'").get()) {
      for (const poseId of insertedPoses) {
        db.prepare("INSERT OR IGNORE INTO pose_categories (pose_id, category_id) SELECT pc.pose_id, sc.id FROM pose_categories pc JOIN categories yc ON yc.id = pc.category_id JOIN categories sc ON sc.name = yc.name AND sc.practice_type = 'stretching' WHERE pc.pose_id = ? AND yc.practice_type = 'yoga'").run(poseId);
      }
    }
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('bundled_library_v1', '1')").run();
  })();
}

/** WAL-aware consistent backup, once before this release alters an existing DB. */
function backupBeforeUpgrade(db, dbPath) {
  if (dbPath === ":memory:") return;
  const backup = `${dbPath}.before-offline-v1.bak`;
  if (fs.existsSync(backup)) return;
  const hasData = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'poses'").get();
  if (hasData) {
    const hasMeta = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'").get();
    if (hasMeta && db.prepare("SELECT value FROM app_meta WHERE key = 'bundled_library_v1'").get()) return;
    db.prepare("VACUUM INTO ?").run(backup);
  }
}

module.exports = { seedLibrary, backupBeforeUpgrade };