# Image Culling PWA — Requirements

## Overview

A Progressive Web App (PWA) that runs in Chrome on an Android phone and connects to a lightweight HTTP server running on a Windows PC on the same local network. The app allows the user to browse folders of images and delete unwanted ones using a swipe gesture, from the comfort of their couch.

---

## Architecture

```
Android Phone (Chrome PWA)
        |
        |  HTTP over local WiFi
        |
Windows PC (Node.js/Express HTTP server)
        |
        |  File system access
        |
  Image folders on disk
```

### Components

1. **Windows Backend** — A small HTTP server written in Node.js (using `express`), running on the Windows PC. Exposes a REST API for browsing folders, generating thumbnails, and moving files to a trash directory (with restore).
2. **PWA Frontend** — A single HTML/CSS/JS app served by the backend (or hosted statically). Runs in Chrome on Android and communicates with the backend via `fetch()`.

---

## Backend Requirements (Node.js / Express)

### General
- Written in Node.js (18+) using `express` for routing and `sharp` for image processing
- Runs as a standalone process on Windows
- Listens on a configurable port (default: `8080`)
- Serves the PWA frontend static files from a `/public` directory
- CORS headers enabled for local development flexibility
- Startup script or batch file to launch the server easily

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/folders` | List configured root folders available to browse |
| `GET` | `/api/files?path=<dir>` | List image files in the given directory |
| `GET` | `/api/image?path=<file>` | Serve a full image file |
| `GET` | `/api/thumb?path=<file>` | Serve a downscaled thumbnail (max 1200px long edge) |
| `POST` | `/api/pile?path=<file>&to=keep\|delete` | Move the file into `_kept` or `_deleted` sibling subfolder; returns `{newPath}` |
| `POST` | `/api/restore?path=<fileInPile>` | Move a file out of `_kept` or `_deleted` back to the parent folder; returns `{newPath}` |

### Security & Safety
- The server only allows access to paths within a set of **configured root folders** (defined in a config file or hardcoded list). Requests outside those paths are rejected with `403 Forbidden`.
- No authentication required (local network only), but a simple shared secret header (`X-App-Token`) can be added as an optional future enhancement.
- **Both keep and delete are non-destructive moves.** Right-swipe moves the file into a `_kept` subfolder inside the folder being culled; left-swipe moves it into a `_deleted` sibling. The original folder shrinks as you cull, so restarting the app on the same folder picks up only undecided files. On filename collisions inside a pile, the destination is auto-suffixed `-1`, `-2`, etc. An **Undo** button (top-right of the browser view, hidden when there's nothing to undo) reverses the most recent action — keep or delete — using `POST /api/restore`. The swipe gesture itself is the confirmation step; there is no separate "Are you sure?" prompt. The `_kept` and `_deleted` folders are never auto-emptied; the user manages them via Explorer when ready.

### Thumbnail Generation
- Thumbnails generated on-the-fly using the `sharp` Node module
- Resized to a 1200px long edge, JPEG quality ~82 — sized to look crisp full-screen on a typical phone while remaining a fraction of the original byte size
- Cached on disk in `thumb_cache_dir` to avoid regenerating on every request
- Cache keyed by `sha1(absPath + ":" + mtimeMs)`; a file edit produces a fresh key automatically

---

## Frontend Requirements (PWA — HTML/CSS/JS)

### General
- Single HTML file with embedded CSS and JS (or minimal separate files)
- Served from the Dart backend
- Installable as a PWA via a `manifest.json` (icon, name, display: standalone)
- Works offline for the UI shell; data requires network connection to the PC
- No build step required — plain HTML/CSS/JS, no framework

### Screens

#### 1. Folder Selection Screen
- Displayed on first load
- Shows a list of available root folders returned by `/api/folders`
- Tap a folder to enter it and begin browsing

#### 2. Image Browser Screen
- Shows images in the selected folder one at a time, full-screen
- Displays filename and remaining image count (e.g. "12 / 47")
- Preloads the next image in the background for smooth transitions

#### 3. Swipe Interaction
- **Swipe left** → Move the image into the `_deleted` subfolder (with a red overlay during the drag)
- **Swipe right** → Move the image into the `_kept` subfolder (with a green overlay during the drag)
- **Tap** → Toggle full-screen preview (swaps the thumbnail for the full-resolution image and enables pinch-to-zoom)
- **Undo button** (in the browser-view header, shown only when there's something to undo) — reverses the most recent action (keep or delete) by moving the file back out of its pile; toast confirms with the filename
- Visual drag feedback: image follows the finger, tilts slightly, colour tint appears (red = delete, green = keep)
- After swipe resolves, the next image slides in from the opposite side

#### 4. Completion Screen
- Shown when all images in the folder have been reviewed
- Displays a summary: how many kept, how many deleted
- Button to return to folder selection

### Error Handling
- If the server is unreachable, show a friendly message with the expected server URL
- If a delete fails, show an error toast and do not advance to the next image
- If an image fails to load, show a placeholder and allow the user to skip or delete

---

## Configuration

A simple `config.json` file in the server directory:

```json
{
  "port": 8080,
  "roots": [
    "C:\\Users\\YourName\\Pictures",
    "D:\\Photos\\2024"
  ],
  "thumb_cache_dir": "C:\\Temp\\pwa-thumb-cache"
}
```

There is no separate trash setting — each root folder gets its own `_kept` and `_deleted` subfolders created lazily on first use.

---

## File Filtering

- Only show files with extensions: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Hidden files and system files are excluded
- Files are sorted by name (ascending) by default

---

## Non-Functional Requirements

- Thumbnails should load within 1–2 seconds on a typical home WiFi network
- Deletes should complete within 1 second
- The app should feel responsive and smooth on a mid-range Android phone
- No data leaves the local network

---

## Out of Scope (Future Enhancements)

- Auto-emptying / cleanup of the `_kept` and `_deleted` subfolders (user manages them manually via Explorer for now)
- Configurable pile-folder names (currently hardcoded `_kept` / `_deleted`)
- Browsing into `_kept` / `_deleted` from within the PWA
- Multi-folder browsing / recursive subfolder view
- Rating/tagging images (e.g. 1–5 star scores or color labels written to XMP/EXIF) as an alternative to the binary keep/delete workflow
- Authentication / HTTPS
- iOS support
- Automatic server startup on Windows boot (as a service)

---

## Development Setup

### Prerequisites
- [Node.js 18+](https://nodejs.org) installed on the Windows PC
- Chrome on Android phone
- Both devices on the same WiFi network

### Running the Server
```bash
cd server
npm install
npm start
```

Or double-click `run-server.bat`.

### Accessing the PWA
Open Chrome on your Android phone and navigate to:
```
http://<your-pc-local-ip>:8080
```
Find your PC's local IP with `ipconfig` in a Windows command prompt (look for `IPv4 Address` under your WiFi adapter).

### Windows Firewall
You will need to allow inbound connections on port `8080`. When you first run the server, Windows may prompt you automatically. If not, add a rule manually in Windows Defender Firewall.
