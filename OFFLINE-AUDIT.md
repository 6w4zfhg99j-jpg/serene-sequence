# VONA offline functionality audit

## Confirmed causes and gaps

The browser preview cannot cold-load without its server. Reproduced by loading the
preview, disconnecting browser networking, and reloading. This is distinct from a
packaged desktop launch, which was already configured to load local static files.

Before this change, a new browser workspace awaited six Cloud reads and every
pose image whenever `navigator.onLine` was true. An inaccessible service or one
failed photo blocked local creation. Initializing offline instead permanently
created an empty library. Electron seeded only categories, not the public poses.

The desktop also had conditional failures: an inherited `ELECTRON_START_URL` could
select a server even in a packaged app; missing preload silently selected browser
storage; missing JavaScript files received HTML; native SQLite loading errors
occurred outside the startup error handler. Google Fonts remained online assets.

These findings do **not** prove which conditional failure occurred in the user’s
previous installed Mac app: that binary and its logs were not available here.

## Corrections

- Core APIs dispatch exclusively to the local storage bridge; no Cloud CRUD fallback.
- New browser workspaces initialize from bundled public content, without network.
- Electron seeds the same public poses, photos and organization once, transactionally,
  preserving preexisting records and never shipping personal saved sequences.
- Packaged startup always uses `app://vona`; external requests are denied, missing
  files return 404 and missing preload cannot silently switch persistence.
- Local UI fonts preserve the existing design; PDF fonts remain embedded.
- SQLite upgrades back up existing data consistently before changes. Upgrades and
  pose saves are atomic; existing database/image paths remain unchanged.
- Desktop build validation checks local shell resources before packaging; native
  dependency rebuilding explicitly targets macOS arm64. Hosted configuration stays
  intact; desktop Start middleware does not request Cloud sessions.
- Updated pose cache invalidation and retry behavior for temporarily failed PDF images.

## Verification actually performed

- 23 passing automated tests: browser IndexedDB, desktop SQLite, images, first-run
  seed, Yoga/Stretching, reorder/removal, save/reopen, rollback and WAL-aware backup,
  URL guards, missing-module handling and bundle validation against test fixtures.
- Startup also passes with `navigator.onLine` true while every network request is
  rejected, without loading Cloud; repeated initialization preserves local saves.
- Browser UI with all external requests blocked: fresh public library and photos,
  search, new pose/photo/visual bold, Yoga and Stretching creation, offline saves,
  readback after reopening, and PDF download with an embedded JPEG image.
- No external request attempts or runtime errors in that successful UI check.
- Preview compilation passed. No production desktop build was run here.

## Remaining limits

Actual macOS DMG building, installation, native arm64 loading, `app://` packaged
rendering and disconnected quit/relaunch remain **unverified**: this environment
is Linux x86_64. `DESKTOP.md` contains the Mac acceptance checklist and an isolated
profile launcher. SQLite reopen tests are not a substitute for that acceptance test.

The browser preview still cannot cold-load or load previously unopened page chunks
without its server; this task corrects desktop offline architecture, not web caching.

Bundled library is a snapshot of public content only (2 poses). Extra personal
browser/desktop data is preserved in its existing workspace, not synchronized.
Existing remote-only historical photos cannot become local without obtaining the
original file; references are preserved, and the production runtime blocks remote
fetching. The installed app version the user previously used was not inspected.