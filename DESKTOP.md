# Building the macOS desktop app (Apple Silicon)

On your MacBook, in the project folder:

```bash
npm install
npm run desktop:dmg
```

The installer lands in `release/VONA-<version>-arm64.dmg`.

What that single command does:

1. `ELECTRON_BUILD=1 vite build` — builds a static, offline SPA shell into `dist/client`
   (no server needed). Electron serves it over a custom `app://` scheme, so the
   absolute `/assets/...` URLs and client-side routes both resolve.
2. `desktop:verify` checks that the local shell and referenced resources exist and no online shell resources are required.
3. `electron-builder install-app-deps --platform=darwin --arch=arm64` rebuilds SQLite for Electron/Apple Silicon.
4. `electron-builder --mac dmg --arm64` packages and produces the `.dmg`.

## Notes

- The build is **unsigned** (no Apple Developer account needed). The first launch
  needs right-click → Open, or System Settings → Privacy & Security → Open Anyway.
- Data lives locally: `~/Library/Application Support/VONA/vona/vona.db`
  and photos in `.../vona/images`. A new installation includes the existing public
  library snapshot (2 poses, 12 categories per practice mode, subcategories and tags),
  with embedded photos. Personal browser sequences are not copied into an installer.
  Existing desktop poses, sequences and organization are not replaced.
- Every exercise has a Library assignment: Yoga, Stretching, or Both Yoga and
  Stretching. New exercises default to the active mode. Assignment is independent
  of category links; Both has separately editable Yoga and Stretching categories.
- Existing unassigned Yoga exercises stay Yoga, even if an older version copied
  category links into Stretching. Legacy Stretching-only exercises stay Stretching.
  No pose or category records are deleted. Choose Both explicitly to share an exercise.
- Changing assignment keeps existing saved sequence items; their information is
  always resolved from the same shared exercise. Removed membership hides an
  exercise from that mode’s gallery and builder, not from saved practices.
- The assignment upgrade stores a browser snapshot backup and creates a consistent
  `vona.db.before-pose-assignment-v1.bak` for existing upgraded desktop workspaces.
- Dev mode: `npm run dev` in one terminal, `npm run electron:dev` in another.
- Config lives in `electron-builder.yml`; the app icon is `public/icon.png`.

## Offline architecture and safe upgrades

- Packaged VONA always opens `app://vona/`, never the preview or a development server.
- All core operations use SQLite through the isolated preload bridge. Missing preload
  is an error, not permission to silently open another database.
- UI fonts, PDF fonts and bundled pose photos are local. Uploaded photos are copied
  into the existing images directory. No account or Cloud connection is needed.
- External network requests are denied by the production desktop runtime.
- Existing database upgrades create `vona.db.before-offline-v1.bak` before changes,
  using a consistent WAL-aware SQLite backup. Schema updates and library imports
  are transactional. Do not replace or delete your application data folder.
- Existing records win over bundled seed records; the seed runs once. Newly added
  content does not duplicate a pose with the same stable ID. Deleted bundled poses
  are not reintroduced on later launches.
- Existing historical remote-only image references are preserved, not fetched or
  silently rewritten. Such a photo must be replaced from a local file to work offline.
- Seven-day sequence Trash retention remains unchanged; normal list operations
  purge expired entries. Pose deletion retains the existing destructive behavior.
- The **web preview is not the desktop app**. Local writes work in an opened browser
  page, but cold web reload and never-loaded page chunks still require internet.
  No service worker or browser cache substitute was added for desktop functionality.

## Actual packaged macOS acceptance check

This checklist has **not** been executed in the Linux editing environment. It must
be run against the newly built, installed macOS arm64 app, not a browser preview.
Build dependencies may need internet during installation/build; runtime must not.

1. Build the DMG with `npm run desktop:dmg` and install it into Applications.
2. Quit any existing VONA instance, disconnect Wi-Fi **and** Ethernet.
3. Run `npm run desktop:offline-check` from this project. It launches the installed
   app using a separate temporary profile, leaving personal work untouched.
4. Open Pose Library; confirm both included photos. Search and filter categories
   in Yoga. Confirm existing Yoga poses are not automatically visible in Stretching.
   Add Yoga-only, Stretching-only and Both poses with local photos and notes; check
   visibility and independent category selections in both modes.
5. Create a sequence in each mode. Add multiple poses, reorder them, remove one,
   edit pose notes and practice notes, and press Save.
6. Open Saved Sequences, reopen and edit both sequences. Export PDF; inspect images
   and Ukrainian text. Create and rename a folder and move a sequence into it.
   Change a shared pose to Yoga-only and edit its information; confirm an existing
   Stretching sequence still retains that updated pose, while its library hides it.
7. Quit VONA using Cmd+Q. The check relaunches the **same** offline test profile.
   Confirm new poses, photos, sequence order, notes and folder assignments remain.
8. Record any failed steps. Test an upgrade separately using a **copy** of a real
   previous workspace; keep the original untouched and verify the backup first.

To test another installed location, use:
`npm run desktop:offline-check -- /path/to/VONA.app/Contents/MacOS/VONA`.

The launcher does not change your Mac’s networking or automatically verify UI
actions; it isolates data and performs the restart. Keep it disconnected yourself.

