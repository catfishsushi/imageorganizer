# Image Culling Server

Local LAN server that backs the Image Culling PWA. Single user, no auth — bind to a trusted network only.

## Setup

1. Install Node.js 18+.
2. From this directory:
   ```
   npm install
   ```
3. Copy `config.example.json` to `config.json` and edit:
   - `port` — TCP port to bind on `0.0.0.0`.
   - `roots` — absolute paths to the folders you want to cull. Anything outside these is rejected with `403`.
   - `thumb_cache_dir` — where to store generated thumbnails. Created on startup if missing.
4. Allow the chosen port through Windows Firewall (Private network).

## Run

```
run-server.bat
```

or

```
npm start
```

The server logs the URL it bound to. Open it from a phone on the same WiFi.

## Endpoints

- `GET /api/health` — liveness probe.
- `GET /api/folders` — configured roots.
- `GET /api/files?path=<dir>` — image files in `dir` (must be inside a root). Directories (including `_kept` / `_deleted`) are excluded.
- `GET /api/image?path=<file>` — stream a full image.
- `GET /api/thumb?path=<file>` — 1200px long-edge JPEG thumbnail (cached on disk).
- `POST /api/pile?path=<file>&to=keep|delete` — move a file into the `_kept` or `_deleted` subfolder of its current directory. Auto-suffixes the basename on collision.
- `POST /api/restore?path=<file-in-pile>` — move a file out of `_kept` or `_deleted` back to the parent folder.

## Decision model

Each folder being culled gets two lazily-created subfolders, `_kept` and `_deleted`. Right-swipe moves the file into `_kept`; left-swipe moves it into `_deleted`. The Undo button in the PWA reverses the most recent action via `/api/restore`. The source folder shrinks as you cull, so restarting on the same folder picks up only undecided files. The PWA never empties these subfolders — clean them up in Explorer when you're sure.

## Security model

This server has no authentication. The `path_guard` module is the only thing standing between an attacker on your LAN and your filesystem. Keep roots narrow.
