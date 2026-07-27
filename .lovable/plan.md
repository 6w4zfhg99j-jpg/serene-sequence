
# Yoga Sequences — Offline Desktop App

Goal: ship a personal Electron desktop app with a fast 3-section workflow, while keeping the existing cloud-backed web version working.

## 1. Three sections (nav simplified)

Rewire `AppNav` and routes so only three destinations exist:

- `/library` — Pose Library (existing, kept)
- `/builder` — Create Sequence (new hero page, single screen)
- `/` — Saved Sequences (existing dashboard, renamed in nav)

Remove any other top-level nav entries. `sequences/$id` still opens for editing an existing saved sequence, reusing the builder.

## 2. Create Sequence — one screen, two panels

Rebuild `/builder` (and reuse for `/sequences/$id`) around a fixed two-panel layout:

```text
┌─────────────────────┬────────────────────────────┐
│ LIBRARY (left)      │ SEQUENCE (right)           │
│ ─ Search + fav      │ Title • Level • Duration   │
│ ─ Category groups   │ ── Pose 1  [notes] [dup] × │
│   ▸ Warm-up (12)    │ ── Pose 2  [notes] [dup] × │
│   ▾ Standing (18)   │ ── Pose 3  [notes] [dup] × │
│      [card][card]…  │ …                          │
│   ▸ Balance (9)     │ [Save]  [Export PDF]       │
└─────────────────────┴────────────────────────────┘
```

- Left panel groups the whole library under collapsible category headers (persist expand/collapse in `localStorage`). Uncategorized poses go under "Other".
- Each library card is a small image + name. **Single click adds the pose to the sequence immediately** — no dialog, no toast spam, no confirmation. A subtle inline pulse acknowledges the add.
- Right panel is a live sequence timeline: drag-and-drop reorder (dnd-kit, already installed), duplicate, delete, inline notes, per-pose duration override.
- Sequence header fields (title, description, level, tags) live above the timeline in a compact bar.
- Autosave to the active data source when editing a saved sequence; unsaved new sequences show a Save button.

## 3. Local (offline) data mode — dual-source architecture

Introduce a data-source abstraction so the same UI works against cloud or local storage.

- New `src/lib/data/` module exports the same shape as today's `yoga-api.ts` (`fetchPoses`, `upsertPose`, `fetchSequences`, `saveSequence`, `uploadPoseImage`, …).
- Two implementations:
  - `data/cloud.ts` — wraps the existing Supabase functions unchanged.
  - `data/local.ts` — new; uses SQLite (better-sqlite3 in Electron) for structured data and the OS filesystem for photos.
- A tiny runtime switch picks the impl:
  - In Electron: `window.yoga` bridge (preload) → SQLite + FS. Mode = `local`.
  - In the browser build: current Supabase behavior. Mode = `cloud`.
- All existing hooks/components import from `@/lib/data` instead of `@/lib/yoga-api`. `yoga-api.ts` becomes the cloud impl re-export to avoid churn.

### Local storage layout (Electron only)

```text
<userData>/asana/
  asana.db              # SQLite: poses, categories, tags, sequences, sequence_poses, joins
  images/
    <uuid>.jpg          # original uploads, referenced by relative path in DB
```

- Schema mirrors the current Postgres tables (same columns, same relations) so cloud/local parity is trivial.
- Photos: main process copies the uploaded file into `images/` and returns a `local://<uuid>.jpg` path. A custom Electron protocol handler serves those files to the renderer. `PoseImage` gains a tiny resolver: `local://` → protocol URL, everything else → current signed-URL path.

## 4. Electron packaging

- Add `electron/main.cjs` (BrowserWindow, `contextIsolation: true`, `nodeIntegration: false`, `base: './'`).
- Add `electron/preload.cjs` exposing a narrow `window.yoga` API: `poses.list`, `poses.upsert`, `poses.delete`, `sequences.*`, `images.import(file)`, `images.resolve(path)`.
- Main-process modules: `db.cjs` (better-sqlite3, migrations, seeded categories) and `images.cjs` (copy, delete, protocol handler).
- `vite.config.ts`: set `base: './'` for file:// loading.
- `package.json`: `"main": "electron/main.cjs"`, add `electron` + `@electron/packager` + `better-sqlite3` as dev/runtime deps.
- Build script produces `electron-release/Asana-<platform>-x64/` and I archive it to `/mnt/documents/` for download (linux `.tar.gz`, macOS/Windows `.zip`).

## 5. What's kept, what's changed

Kept: current design system, PoseCard, PoseFormDialog, PDF export, saved-sequences dashboard, cloud Supabase schema and RLS.

Changed: navigation collapsed to three items; new `/builder` two-panel screen; library grouped by category with collapse; single-click add; data layer indirected through `@/lib/data`.

Added: Electron shell, SQLite local mode, filesystem image storage.

Removed: nothing destructive; the cloud version keeps working when opened in a browser.

## 6. Technical notes

- `better-sqlite3` is a native module; it's bundled by `@electron/packager` and only loaded in the main process, never in the renderer.
- Image protocol: `protocol.registerFileProtocol('local', …)` in main; renderer just does `<img src="local://<uuid>.jpg">`.
- Category collapse state key: `builder.categoryCollapse.v1` in `localStorage`.
- Drag-and-drop: reuse existing `@dnd-kit` setup from `sequences.$id.tsx`.
- The `.env` cloud keys stay untouched; local mode never reads them.

## 7. Deliverables at the end

- Running app in preview (cloud mode) with the new 3-section layout and rebuilt builder.
- Downloadable Electron build for your OS in `/mnt/documents/` (tell me if you're on macOS, Windows, or Linux; I'll default to macOS arm64 + Linux x64 if unspecified).
