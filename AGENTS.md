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
- Browser operations use an IndexedDB-backed LocalBridge and copy existing read-only Cloud data once; Electron keeps SQLite — why: account-free local writes must not weaken Cloud permissions.
- Categories own practice_type; initialize separate Stretching categories and subcategory links once, referencing shared poses — why: independent organization without copying pose data or replacing Yoga assignments.
- Share practice selection above routes and synchronize it when editing a sequence — why: gallery, builder and saved lists must retain the same mode across navigation.
