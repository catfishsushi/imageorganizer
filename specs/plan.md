# Image Culling PWA — Implementation Plan

Derived from [image-culling-pwa-requirements.md](image-culling-pwa-requirements.md).

## Proposed Project Layout

```
ImageOrganizer/
├── specs/
│   └── image-culling-pwa-requirements.md
├── server/
│   ├── bin/
│   │   └── server.dart            # Entry point
│   ├── lib/
│   │   ├── config.dart            # Load + validate config.json
│   │   ├── path_guard.dart        # Restrict access to configured roots
│   │   ├── handlers/
│   │   │   ├── folders.dart       # GET /api/folders
│   │   │   ├── files.dart         # GET /api/files
│   │   │   ├── image.dart         # GET /api/image
│   │   │   ├── thumb.dart         # GET /api/thumb (with cache)
│   │   │   └── delete.dart        # DELETE /api/file
│   │   ├── thumb_cache.dart       # On-disk thumb cache (path+mtime key)
│   │   └── static.dart            # Serve /public PWA shell
│   ├── public/                    # PWA frontend (served as static)
│   │   ├── index.html
│   │   ├── app.css
│   │   ├── app.js
│   │   ├── manifest.json
│   │   ├── service-worker.js
│   │   └── icons/
│   ├── config.json                # User-edited config (gitignored)
│   ├── config.example.json
│   ├── pubspec.yaml
│   ├── run-server.bat             # Convenience launcher
│   └── README.md
└── plan.md
```

## Phase 1 — Backend Skeleton

Goal: a runnable Dart server with config loading and path-safety guard. No image work yet.

1. `pubspec.yaml` with deps: `shelf`, `shelf_router`, `shelf_static`, `image`, `path`, `mime`.
2. [server/lib/config.dart](../server/lib/config.dart) — load `config.json`, normalize root paths to absolute, fail fast on missing/invalid config.
3. [server/lib/path_guard.dart](../server/lib/path_guard.dart) — `resolveSafe(requestedPath)` returns canonical absolute path **only if** it sits inside one of the configured roots; otherwise throws → `403`. Must defend against `..`, symlinks, and mixed separators.
4. [server/bin/server.dart](../server/bin/server.dart) — wire router, CORS middleware, logging middleware, bind to `0.0.0.0:<port>`.
5. `run-server.bat` and a sanity `GET /api/health` endpoint returning `{ok: true}`.

**Done when:** server starts, returns `200` on `/api/health`, and rejects a path-traversal probe with `403`.

## Phase 2 — Folder & File Listing

1. `GET /api/folders` → returns the configured roots as `[{name, path}]`.
2. `GET /api/files?path=<dir>` → lists files in `dir` (must pass `path_guard`), filtered by extension allowlist (`.jpg .jpeg .png .gif .webp`), excluding hidden/system files, sorted ascending by name. Response: `[{name, path, size, mtime}]`.
3. Manual test with `curl` against a real folder.

**Done when:** both endpoints work and a path outside roots yields `403`.

## Phase 3 — Image & Thumbnail Serving

1. `GET /api/image?path=<file>` — stream the file with correct `Content-Type` (use `mime` package) and `Cache-Control: private, max-age=3600`.
2. [server/lib/thumb_cache.dart](../server/lib/thumb_cache.dart) — cache key = `sha1(absPath + ":" + mtimeMs)`, stored as `<thumb_cache_dir>/<key>.jpg`. Create dir on startup if missing.
3. `GET /api/thumb?path=<file>` — if cached file exists, stream it; otherwise decode with `image` package, resize to max 400px on the long edge (preserve aspect), JPEG-encode quality ~80, write to cache, then stream.
4. Generate thumbs off the request thread where practical (or accept synchronous given the local-network single-user load).

**Done when:** thumbnails appear in a browser, second request for the same file is served from cache (verify by mtime of cache file).

## Phase 4 — Delete Endpoint

1. `DELETE /api/file?path=<file>` — `path_guard`, verify the file exists and matches the extension allowlist, `File.delete()`, return `204`.
2. On success, also remove any matching thumbnail cache entry.
3. Manual test: delete a file, confirm it is gone from disk and `GET /api/files` no longer lists it.

**Done when:** the round trip works and a path outside roots is rejected.

## Phase 5 — PWA Shell

1. [server/public/index.html](../server/public/index.html) — three view containers (`#folders`, `#browser`, `#done`), one visible at a time via a class toggle.
2. [server/public/app.css](../server/public/app.css) — full-viewport layout, dark background, large touch targets, no scrollbars on the browser view.
3. [server/public/manifest.json](../server/public/manifest.json) — name, short_name, `display: standalone`, theme/background colors, icons (192 + 512).
4. [server/public/service-worker.js](../server/public/service-worker.js) — cache the shell (HTML/CSS/JS/manifest/icons) with a cache-first strategy. **Never** cache `/api/*` responses.
5. Register the service worker from `app.js`. Confirm "Install app" appears in Chrome on Android.

**Done when:** the PWA installs to the Android home screen and the shell loads while offline (folder list will of course fail offline — that's fine).

## Phase 6 — Folder Selection Screen

1. On load, `fetch('/api/folders')` and render a tappable list.
2. Tap → call `/api/files?path=...`, stash the list in memory, switch to the browser view, start at index 0.
3. Error state: if `/api/folders` fails, show the "server unreachable" message with the expected URL (read from `window.location.origin`).

## Phase 7 — Image Browser & Swipe Gesture

1. State: `files[]`, `index`, `kept`, `deleted`.
2. Render: current image via `/api/image?path=...`, filename, `index+1 / files.length`. Preload `files[index+1]` with `new Image()`.
3. Swipe gesture (vanilla pointer events — no library):
   - Track `pointerdown` → `pointermove` → `pointerup`/`pointercancel`.
   - During drag: translate the image by `dx`, rotate `dx / 20` degrees, fade in a red tint when `dx < -threshold` and green when `dx > threshold`.
   - On release: if `|dx| > 30% viewport width` **or** velocity exceeds threshold, commit swipe; otherwise spring back.
   - Left commit → call `DELETE /api/file`, on success advance (`deleted++`), on failure show toast and reset.
   - Right commit → advance (`kept++`).
4. Tap (no significant drag) → toggle full-screen preview class on the image (CSS `object-fit: contain` vs zoomed).
5. Pinch-to-zoom (in full-screen preview mode):
   - Track two-pointer gestures: compute centroid + distance between pointers each `pointermove`.
   - Maintain `scale` (1.0–4.0) and `translateX/Y`; apply via a single CSS `transform: translate(...) scale(...)`.
   - On pinch: `scale *= newDistance / oldDistance`, clamped; keep the centroid anchored (adjust translate so the world-point under the centroid stays put).
   - Single-finger pan only when `scale > 1`; otherwise leave the swipe gesture in charge.
   - Double-tap toggles between `scale: 1` and `scale: 2` centered on the tap point.
   - Reset transform when advancing to the next image.
6. When `index >= files.length`, switch to the completion view.

**Done when:** swiping on the phone deletes/keeps files smoothly with visual feedback.

## Phase 8 — Completion Screen & Error Polish

1. Completion view: "Kept X · Deleted Y" and a "Back to folders" button.
2. Image-load error: show a placeholder with **Skip** and **Delete** buttons.
3. Delete failure: red toast at the bottom for 2s, stay on current image.
4. Server-unreachable banner on any network error, with a retry button.

## Phase 9 — Manual Test Pass

Hand-test on the target hardware (Windows host + Android phone on same WiFi):

- [ ] Configure two real root folders, restart server.
- [ ] Install PWA on Android home screen.
- [ ] Browse each folder; swipe through ~20 images; verify deletes hit disk.
- [ ] Path-traversal probe: `curl "http://<ip>:8080/api/files?path=C:\Windows"` → `403`.
- [ ] Thumbnail cache: delete a file outside the app, confirm stale thumb is not served on next list (mtime change forces new key, old cache entry just becomes orphan — acceptable).
- [ ] Firewall: confirm the inbound rule for port 8080 was created/accepted.
- [ ] Non-functional: thumbs feel <2s, deletes feel <1s.

## Out of Scope (per spec)

Undo / trash folder, recursive subfolder browsing, ratings, auth, HTTPS, iOS, auto-start as a Windows service.
