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
Windows PC (Dart/shelf HTTP server)
        |
        |  File system access
        |
  Image folders on disk
```

### Components

1. **Windows Backend** — A small HTTP server written in Dart (using the `shelf` package), running on the Windows PC. Exposes a REST API for browsing folders and deleting files.
2. **PWA Frontend** — A single HTML/CSS/JS app served by the backend (or hosted statically). Runs in Chrome on Android and communicates with the backend via `fetch()`.

---

## Backend Requirements (Dart / shelf)

### General
- Written in Dart using the `shelf` and `shelf_router` packages
- Runs as a standalone executable on Windows
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
| `GET` | `/api/thumb?path=<file>` | Serve a downscaled thumbnail (max 400px wide) |
| `DELETE` | `/api/file?path=<file>` | Delete the specified file from disk |

### Security & Safety
- The server only allows access to paths within a set of **configured root folders** (defined in a config file or hardcoded list). Requests outside those paths are rejected with `403 Forbidden`.
- No authentication required (local network only), but a simple shared secret header (`X-App-Token`) can be added as an optional future enhancement.
- Deletion is permanent (no recycle bin). A confirmation step is handled on the frontend.

### Thumbnail Generation
- Thumbnails generated on-the-fly using Dart's `image` package
- Cached in a temp directory to avoid regenerating on every request
- Cache keyed by file path + last-modified timestamp

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
- **Swipe left** → Delete the image (with a brief red overlay confirmation)
- **Swipe right** → Keep the image, advance to the next
- **Tap** → Toggle a full-screen preview (pinch-to-zoom optional, nice to have)
- Visual drag feedback: image follows the finger, tilts slightly, colour tint appears (red = delete, green = keep)
- After swipe resolves, the next image slides in automatically

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

---

## File Filtering

- Only show files with extensions: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.heic`
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

- Undo delete (move to a trash folder instead of permanent delete)
- Multi-folder browsing / recursive subfolder view
- Rating/tagging images instead of binary keep/delete
- Authentication / HTTPS
- iOS support
- Automatic server startup on Windows boot (as a service)

---

## Development Setup

### Prerequisites
- [Dart SDK](https://dart.dev/get-dart) installed on the Windows PC
- Chrome on Android phone
- Both devices on the same WiFi network

### Running the Server
```bash
cd server
dart pub get
dart run bin/server.dart
```

### Accessing the PWA
Open Chrome on your Android phone and navigate to:
```
http://<your-pc-local-ip>:8080
```
Find your PC's local IP with `ipconfig` in a Windows command prompt (look for `IPv4 Address` under your WiFi adapter).

### Windows Firewall
You will need to allow inbound connections on port `8080`. When you first run the server, Windows may prompt you automatically. If not, add a rule manually in Windows Defender Firewall.
