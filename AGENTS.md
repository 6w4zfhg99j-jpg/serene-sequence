<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Sequences carry a practice_type (yoga|stretching, default yoga) in both Cloud and the Electron SQLite DB; poses stay shared across types — why: one unified library, no duplicated poses.
- Core operations use only LocalBridge (IndexedDB in browsers, SQLite in Electron), initialized from the bundled public library; preserve existing browser snapshots — why: connectivity must never block local work or replace personal data.
- Categories own practice_type; initialize separate Stretching categories and subcategory links once, referencing shared poses — why: independent organization without copying pose data or replacing Yoga assignments.
- Share practice selection above routes and synchronize it when editing a sequence — why: gallery, builder and saved lists must retain the same mode across navigation.
- Local queries and mutations use networkMode always — why: IndexedDB and SQLite operations must run when the browser reports offline.
- Editor header fields use local drafts until saved, rather than mutable query-cache drafts — why: pose-note refetches must not overwrite unsaved title or practice notes.
- Packaged desktop always loads dist/client over app://vona, rejects external requests and missing preload, and validates shell assets before packaging — why: offline startup must not silently use a server or another workspace.
- SQLite upgrades run transactionally after a once-per-upgrade WAL-aware backup, and pose upserts are atomic — why: interrupted upgrades or invalid relationship IDs must not destroy existing data.
- Bundle UI fonts and public-library photos locally; seed SQLite once with stable IDs without replacing existing rows — why: offline rendering and first launch must not rely on CDN or Cloud availability.
