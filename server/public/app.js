'use strict';

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const views = {
  folders: $('folders'),
  browser: $('browser'),
  done: $('done'),
};
const folderList = $('folder-list');
const foldersStatus = $('folders-status');
const cardStage = $('card-stage');
const cardImg = $('card-img');
const cardPlaceholder = $('card-placeholder');
const tintLeft = $('tint-left');
const tintRight = $('tint-right');
const browserFilename = $('browser-filename');
const browserCounter = $('browser-counter');
const toast = $('toast');
const banner = $('banner');
const bannerMsg = $('banner-message');
const doneSummary = $('done-summary');

// ---- State ----
const state = {
  files: [],
  index: 0,
  kept: 0,
  deleted: 0,
  preview: false,
  scale: 1,
  tx: 0,
  ty: 0,
  preloader: null,
  currentFolderPath: null,
};

let lastDoneFn = null; // for banner retry

// ---- View switching ----
function showView(name) {
  for (const [k, el] of Object.entries(views)) {
    el.classList.toggle('active', k === name);
  }
}

// ---- Banner / Toast ----
function showBanner(message, retry) {
  bannerMsg.textContent = message;
  banner.classList.remove('hidden');
  lastDoneFn = retry || null;
}
function hideBanner() { banner.classList.add('hidden'); }
$('banner-retry').addEventListener('click', () => {
  hideBanner();
  if (lastDoneFn) lastDoneFn();
});

let toastTimer = null;
function showToast(message, ms = 2000) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), ms);
}

// ---- API ----
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res;
}
const imageUrl = (p) => `/api/image?path=${encodeURIComponent(p)}`;

// ---- Folder list (Phase 6) ----
async function loadFolders() {
  foldersStatus.textContent = '';
  folderList.innerHTML = '';
  try {
    const res = await api('/api/folders');
    const folders = await res.json();
    if (folders.length === 0) {
      foldersStatus.textContent = 'No folders configured. Edit server/config.json.';
      return;
    }
    for (const f of folders) {
      const li = document.createElement('li');
      li.textContent = f.name;
      const sub = document.createElement('span');
      sub.className = 'folder-path';
      sub.textContent = f.path;
      li.appendChild(sub);
      li.addEventListener('click', () => openFolder(f));
      folderList.appendChild(li);
    }
    hideBanner();
  } catch (e) {
    showBanner(`Server unreachable at ${window.location.origin}.`, loadFolders);
  }
}

async function openFolder(folder) {
  state.currentFolderPath = folder.path;
  try {
    const res = await api(`/api/files?path=${encodeURIComponent(folder.path)}`);
    const files = await res.json();
    if (files.length === 0) {
      showToast('No images in that folder.');
      return;
    }
    state.files = files;
    state.index = 0;
    state.kept = 0;
    state.deleted = 0;
    showView('browser');
    renderCurrent();
  } catch (e) {
    showBanner(`Could not load folder.`, () => openFolder(folder));
  }
}

// ---- Browser rendering (Phase 7) ----
function resetTransformState() {
  state.scale = 1;
  state.tx = 0;
  state.ty = 0;
  state.preview = false;
  cardImg.classList.remove('preview', 'dragging');
  applyTransform();
}

function applyTransform({ rotateDeg = 0 } = {}) {
  cardImg.style.transform =
    `translate(${state.tx}px, ${state.ty}px) rotate(${rotateDeg}deg) scale(${state.scale})`;
}

function renderCurrent() {
  if (state.index >= state.files.length) {
    finish();
    return;
  }
  const f = state.files[state.index];
  cardPlaceholder.classList.add('hidden');
  cardImg.classList.remove('hidden');
  resetTransformState();
  cardImg.onerror = onImageError;
  cardImg.onload = onImageLoad;
  cardImg.src = imageUrl(f.path);
  browserFilename.textContent = f.name;
  browserCounter.textContent = `${state.index + 1} / ${state.files.length}`;
  preloadNext();
}

function onImageLoad() {
  cardImg.onerror = null;
}
function onImageError() {
  cardImg.classList.add('hidden');
  cardPlaceholder.classList.remove('hidden');
}

function preloadNext() {
  const next = state.files[state.index + 1];
  if (!next) return;
  if (state.preloader) state.preloader.onload = null;
  state.preloader = new Image();
  state.preloader.src = imageUrl(next.path);
}

function advance({ kept = false, deleted = false } = {}) {
  if (kept) state.kept++;
  if (deleted) state.deleted++;
  state.index++;
  renderCurrent();
}

function finish() {
  doneSummary.textContent = `Kept ${state.kept} · Deleted ${state.deleted}`;
  showView('done');
}

// ---- Swipe + pinch gesture engine ----
const pointers = new Map(); // pointerId -> {x,y,startX,startY,startTime}
let gestureMode = null; // 'swipe' | 'pinch' | 'pan' | null
let pinchStart = null;  // {dist, scale, centroidX, centroidY, tx, ty}
let swipeStart = null;  // {x, y, t}
const COMMIT_FRAC = 0.30;
const VELOCITY_PX_PER_MS = 0.6;
const TAP_MOVE = 6;
const TAP_MS = 300;
const SCALE_MIN = 1;
const SCALE_MAX = 4;

let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;

function pointerInfo(e) {
  return { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, startTime: performance.now() };
}

function centroidOf(map) {
  let sx = 0, sy = 0, n = 0;
  for (const p of map.values()) { sx += p.x; sy += p.y; n++; }
  return { x: sx / n, y: sy / n };
}
function distanceOf(map) {
  const arr = [...map.values()];
  if (arr.length < 2) return 0;
  const a = arr[0], b = arr[1];
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

cardStage.addEventListener('pointerdown', (e) => {
  if (!views.browser.classList.contains('active')) return;
  try { cardStage.setPointerCapture(e.pointerId); } catch (_) { /* synthetic / unsupported */ }
  pointers.set(e.pointerId, pointerInfo(e));

  if (pointers.size === 1) {
    if (state.preview && state.scale > 1) {
      gestureMode = 'pan';
    } else if (!state.preview) {
      gestureMode = 'swipe';
      swipeStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      cardImg.classList.add('dragging');
    } else {
      gestureMode = null; // preview mode at scale 1 — wait for tap or pinch
    }
  } else if (pointers.size === 2) {
    gestureMode = 'pinch';
    const c = centroidOf(pointers);
    pinchStart = {
      dist: distanceOf(pointers),
      scale: state.scale,
      tx: state.tx,
      ty: state.ty,
      centroidX: c.x,
      centroidY: c.y,
    };
    cardImg.classList.add('dragging');
  }
});

cardStage.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;

  if (gestureMode === 'swipe') {
    const dx = p.x - p.startX;
    const dy = p.y - p.startY;
    state.tx = dx;
    state.ty = dy * 0.2;
    const rotateDeg = dx / 20;
    applyTransform({ rotateDeg });
    const vw = window.innerWidth;
    const threshold = vw * 0.15; // start showing tint earlier than commit
    tintLeft.style.opacity = dx < 0 ? clamp(-dx / threshold, 0, 1) : 0;
    tintRight.style.opacity = dx > 0 ? clamp(dx / threshold, 0, 1) : 0;
  } else if (gestureMode === 'pinch' && pointers.size >= 2) {
    const dist = distanceOf(pointers);
    if (pinchStart.dist > 0) {
      const factor = dist / pinchStart.dist;
      const newScale = clamp(pinchStart.scale * factor, SCALE_MIN, SCALE_MAX);
      // Anchor centroid: keep the world-point under the centroid fixed.
      const W = window.innerWidth, H = window.innerHeight;
      const cx = pinchStart.centroidX, cy = pinchStart.centroidY;
      const worldX = (cx - W / 2 - pinchStart.tx) / pinchStart.scale;
      const worldY = (cy - H / 2 - pinchStart.ty) / pinchStart.scale;
      state.scale = newScale;
      state.tx = cx - W / 2 - newScale * worldX;
      state.ty = cy - H / 2 - newScale * worldY;
      applyTransform();
    }
  } else if (gestureMode === 'pan') {
    const dx = p.x - p.startX;
    const dy = p.y - p.startY;
    // Use a baseline so subsequent moves are relative; recompute "start" each move:
    state.tx += dx;
    state.ty += dy;
    p.startX = p.x;
    p.startY = p.y;
    applyTransform();
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);

  if (gestureMode === 'swipe' && pointers.size === 0) {
    cardImg.classList.remove('dragging');
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    const elapsed = performance.now() - swipeStart.t;
    const absDx = Math.abs(dx);
    const vw = window.innerWidth;
    const velocity = absDx / Math.max(1, elapsed);

    const isTap = absDx < TAP_MOVE && Math.abs(dy) < TAP_MOVE && elapsed < TAP_MS;
    if (isTap) {
      handleTap(e.clientX, e.clientY);
      springBack();
      return;
    }

    const commit = absDx > vw * COMMIT_FRAC || velocity > VELOCITY_PX_PER_MS;
    if (commit) {
      if (dx < 0) commitDelete();
      else commitKeep();
    } else {
      springBack();
    }
  } else if (gestureMode === 'pinch' && pointers.size < 2) {
    // If one finger lifted but another remains, transition to pan mode
    if (pointers.size === 1 && state.scale > 1) {
      gestureMode = 'pan';
      const remaining = [...pointers.values()][0];
      remaining.startX = remaining.x;
      remaining.startY = remaining.y;
    } else {
      gestureMode = null;
      // If we pinched back under 1.0 in preview mode, leave preview
      if (state.scale <= 1.001 && state.preview) {
        exitPreview();
      }
      cardImg.classList.remove('dragging');
    }
  } else if (gestureMode === 'pan' && pointers.size === 0) {
    gestureMode = null;
    cardImg.classList.remove('dragging');
  }
}
cardStage.addEventListener('pointerup', endPointer);
cardStage.addEventListener('pointercancel', endPointer);

function springBack() {
  state.tx = 0;
  state.ty = 0;
  applyTransform();
  tintLeft.style.opacity = 0;
  tintRight.style.opacity = 0;
  gestureMode = null;
}

function flyOff(direction) {
  const vw = window.innerWidth;
  state.tx = direction * vw * 1.4;
  applyTransform({ rotateDeg: direction * 30 });
  tintLeft.style.opacity = 0;
  tintRight.style.opacity = 0;
}

function commitKeep() {
  flyOff(1);
  setTimeout(() => advance({ kept: true }), 200);
}

function commitDelete() {
  flyOff(-1);
  const file = state.files[state.index];
  fetch(`/api/file?path=${encodeURIComponent(file.path)}`, { method: 'DELETE' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTimeout(() => advance({ deleted: true }), 200);
    })
    .catch(() => {
      showToast('Delete failed');
      springBack();
    });
}

// ---- Tap & double-tap (preview mode + double-tap zoom) ----
function handleTap(x, y) {
  const now = performance.now();
  const isDouble = now - lastTapTime < 280
    && Math.abs(x - lastTapX) < 30
    && Math.abs(y - lastTapY) < 30;
  lastTapTime = now;
  lastTapX = x;
  lastTapY = y;

  if (isDouble && state.preview) {
    doubleTapZoom(x, y);
    return;
  }

  if (state.preview) {
    exitPreview();
  } else {
    enterPreview();
  }
}

function enterPreview() {
  state.preview = true;
  cardImg.classList.add('preview');
}
function exitPreview() {
  state.preview = false;
  cardImg.classList.remove('preview');
  state.scale = 1;
  state.tx = 0;
  state.ty = 0;
  applyTransform();
}

function doubleTapZoom(x, y) {
  const W = window.innerWidth, H = window.innerHeight;
  if (state.scale > 1.01) {
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
  } else {
    const newScale = 2;
    const worldX = (x - W / 2 - state.tx) / state.scale;
    const worldY = (y - H / 2 - state.ty) / state.scale;
    state.scale = newScale;
    state.tx = x - W / 2 - newScale * worldX;
    state.ty = y - H / 2 - newScale * worldY;
  }
  applyTransform();
}

// ---- Placeholder buttons ----
$('placeholder-skip').addEventListener('click', () => advance({ kept: true }));
$('placeholder-delete').addEventListener('click', () => commitDelete());

// ---- Back / done buttons ----
$('browser-back').addEventListener('click', () => {
  showView('folders');
  loadFolders();
});
$('done-back').addEventListener('click', () => {
  showView('folders');
  loadFolders();
});

// ---- SW registration ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((e) => {
      console.warn('SW register failed', e);
    });
  });
}

// ---- Boot ----
showView('folders');
loadFolders();
