# Building the macOS desktop app (Apple Silicon)

On your MacBook, in the project folder:

```bash
npm install
npm run desktop:dmg
```

The installer lands in `release/Asana-<version>-arm64.dmg`.

What that single command does:

1. `ELECTRON_BUILD=1 vite build` — builds a static, offline SPA shell into `dist/client`
   (no server needed). Electron serves it over a custom `app://` scheme, so the
   absolute `/assets/...` URLs and client-side routes both resolve.
2. `electron-builder install-app-deps` — rebuilds the native SQLite module for Electron/arm64.
3. `electron-builder --mac dmg --arm64` — packages and produces the `.dmg`.

## Notes

- The build is **unsigned** (no Apple Developer account needed). The first launch
  needs right-click → Open, or System Settings → Privacy & Security → Open Anyway.
- Data lives locally: `~/Library/Application Support/Asana/asana/asana.db`
  and photos in `.../asana/images`. On first launch the database is created with
  the 16 default categories; poses and sequences start empty — the desktop app
  does not read the cloud preview's data.
- Dev mode: `npm run dev` in one terminal, `npm run electron:dev` in another.
- Config lives in `electron-builder.yml`; the app icon is `build/icon.png`.

