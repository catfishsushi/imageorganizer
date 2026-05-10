# Image Culling PWA — Todo List

Working checklist derived from [plan.md](plan.md). Tick items as they ship.

---

## Phase 1 — Backend Skeleton

- [ ] Create `server/` directory and initialize `pubspec.yaml`
- [ ] Add deps: `shelf`, `shelf_router`, `shelf_static`, `image`, `path`, `mime`
- [ ] Write `server/config.example.json` with `port`, `roots[]`, `thumb_cache_dir`
- [ ] Write `server/lib/config.dart` — load + validate `config.json`, normalize roots to absolute paths, fail fast on missing/invalid config
- [ ] Write `server/lib/path_guard.dart` — `resolveSafe()` canonicalizes path and verifies it lives inside a configured root; defend against `..`, symlinks, and mixed `\`/`/` separators
- [ ] Write `server/bin/server.dart` — router + CORS middleware + request logging + bind `0.0.0.0:<port>`
- [ ] Add `GET /api/health` returning `{ok: true}`
- [ ] Write `server/run-server.bat` launcher
- [ ] Add `server/README.md` with run instructions
- [ ] Add `.gitignore` for `config.json` and `thumb_cache_dir`
- [ ] **Verify:** `curl http://localhost:8080/api/health` → `200`
- [ ] **Verify:** path-traversal probe (`?path=C:\Windows`) → `403`

## Phase 2 — Folder & File Listing

- [ ] Implement `GET /api/folders` → `[{name, path}]` from config roots
- [ ] Implement `GET /api/files?path=<dir>` with `path_guard`
- [ ] Extension allowlist filter: `.jpg .jpeg .png .gif .webp`
- [ ] Exclude hidden/system files
- [ ] Sort response ascending by filename
- [ ] Return `[{name, path, size, mtime}]`
- [ ] **Verify:** `curl` both endpoints against a real folder; out-of-root path → `403`

## Phase 3 — Image & Thumbnail Serving

- [ ] Implement `GET /api/image?path=<file>` — stream with correct `Content-Type` via `mime` package and `Cache-Control: private, max-age=3600`
- [ ] Write `server/lib/thumb_cache.dart` — key = `sha1(absPath + ":" + mtimeMs)`, stored as `<thumb_cache_dir>/<key>.jpg`
- [ ] Create `thumb_cache_dir` on startup if missing
- [ ] Implement `GET /api/thumb?path=<file>` — cache-hit streams the file; cache-miss decodes, resizes long edge to 400px (preserve aspect), JPEG quality ~80, writes cache, then streams
- [ ] **Verify:** thumbnail loads in browser; second request reads from cache (check cache file mtime)

## Phase 4 — Delete Endpoint

- [ ] Implement `DELETE /api/file?path=<file>` with `path_guard` + extension check
- [ ] Return `204 No Content` on success
- [ ] Remove matching thumb cache entry on successful delete
- [ ] **Verify:** delete a file, confirm it's gone from disk and from `/api/files` listing

## Phase 5 — PWA Shell

- [ ] Create `server/public/index.html` with three view containers (`#folders`, `#browser`, `#done`)
- [ ] Create `server/public/app.css` — full-viewport dark layout, large touch targets, no scrollbars on browser view
- [ ] Create `server/public/app.js` — view-switching logic skeleton
- [ ] Create `server/public/manifest.json` — name, short_name, `display: standalone`, theme/background colors
- [ ] Add `server/public/icons/icon-192.png` and `icon-512.png`
- [ ] Create `server/public/service-worker.js` — cache shell with cache-first; **never** cache `/api/*`
- [ ] Register service worker from `app.js`
- [ ] Wire `shelf_static` to serve `/public` at `/`
- [ ] **Verify:** Chrome on Android shows "Install app"; shell loads while offline

## Phase 6 — Folder Selection Screen

- [ ] On load, `fetch('/api/folders')` and render a tappable list
- [ ] Tap handler → `fetch('/api/files?path=...')`, stash list in memory, switch to browser view, reset `index=0, kept=0, deleted=0`
- [ ] Error state: server unreachable → friendly message with `window.location.origin`

## Phase 7 — Image Browser & Swipe Gesture

- [ ] State object: `files[]`, `index`, `kept`, `deleted`
- [ ] Render current image via `/api/image?path=...`
- [ ] Display filename and `index+1 / files.length` counter
- [ ] Preload `files[index+1]` with `new Image()`
- [ ] **Swipe gesture (single pointer):**
  - [ ] Track `pointerdown` → `pointermove` → `pointerup`/`pointercancel`
  - [ ] During drag: translate by `dx`, rotate `dx / 20` degrees
  - [ ] Red tint when `dx < -threshold`, green tint when `dx > threshold`
  - [ ] Commit when `|dx| > 30% viewport width` OR velocity exceeds threshold
  - [ ] Otherwise spring back to center
  - [ ] Left commit → `DELETE /api/file`; success advances + `deleted++`; failure shows toast + resets
  - [ ] Right commit → advance + `kept++`
- [ ] **Tap (no significant drag):** toggle full-screen preview class
- [ ] **Pinch-to-zoom (in preview mode):**
  - [ ] Two-pointer tracking: compute centroid + distance each `pointermove`
  - [ ] State: `scale` (clamp 1.0–4.0) and `translateX/Y`, applied via one CSS `transform`
  - [ ] On pinch: `scale *= newDist / oldDist`, anchor centroid (adjust translate so world-point under fingers stays put)
  - [ ] Single-finger pan enabled only when `scale > 1`
  - [ ] Double-tap toggles between `scale: 1` and `scale: 2` centered on tap point
  - [ ] Reset transform when advancing to next image
- [ ] When `index >= files.length`, switch to completion view
- [ ] **Verify on phone:** smooth swipe deletes/keeps files; pinch zoom feels natural

## Phase 8 — Completion Screen & Error Polish

- [ ] Completion view: "Kept X · Deleted Y" + "Back to folders" button
- [ ] Image-load error: placeholder with **Skip** and **Delete** buttons
- [ ] Delete failure: red toast at bottom, 2s, stay on current image
- [ ] Server-unreachable banner with retry button on any network error

## Phase 9 — Manual Test Pass

- [ ] Configure two real root folders, restart server
- [ ] Install PWA on Android home screen
- [ ] Browse each folder; swipe through ~20 images; verify deletes hit disk
- [ ] Path-traversal probe: `curl "http://<ip>:8080/api/files?path=C:\Windows"` → `403`
- [ ] Thumbnail cache: confirm second visit is fast
- [ ] Firewall: confirm inbound rule for port 8080
- [ ] Non-functional: thumbs feel <2s, deletes feel <1s
- [ ] Pinch-zoom works on real device
