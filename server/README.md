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
- `GET /api/files?path=<dir>` — image files in `dir` (must be inside a root).
- `GET /api/image?path=<file>` — stream a full image.
- `GET /api/thumb?path=<file>` — 400px long-edge JPEG thumbnail (cached on disk).
- `DELETE /api/file?path=<file>` — delete a file (must be inside a root, must match the extension allowlist).

## Security model

This server has no authentication. The `path_guard` module is the only thing standing between an attacker on your LAN and your filesystem. Keep roots narrow.
