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
const undoBtn = $('undo-btn');
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
  undoStack: [], // [{ trashId, name }]
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
function showToast(message, ms = 2000, kind = 'error') {
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.toggle('toast-success', kind === 'success');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('toast-success');
  }, ms);
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
const thumbUrl = (p) => `/api/thumb?path=${encodeURIComponent(p)}`;

// ---- Folder list ----
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
    state.undoStack = [];
    updateUndoButton();
    showView('browser');
    renderCurrent();
  } catch (e) {
    showBanner(`Could not load folder.`, () => openFolder(folder));
  }
}

// ---- Browser rendering ----
function applyTransform({ rotateDeg = 0 } = {}) {
  cardImg.style.transform =
    `translate(${state.tx}px, ${state.ty}px) rotate(${rotateDeg}deg) scale(${state.scale})`;
}

function renderCurrent({ slideInFrom = 0 } = {}) {
  if (state.index >= state.files.length) {
    finish();
    return;
  }
  const f = state.files[state.index];
  cardPlaceholder.classList.add('hidden');
  cardImg.classList.remove('hidden');

  // Snap to start position with no transition.
  cardImg.classList.add('dragging');
  cardImg.classList.remove('preview');
  state.preview = false;
  state.scale = 1;
  state.ty = 0;
  state.tx = slideInFrom * window.innerWidth;
  applyTransform();

  cardImg.onerror = onImageError;
  cardImg.onload = onImageLoad;
  cardImg.src = thumbUrl(f.path);
  browserFilename.textContent = f.name;
  browserCounter.textContent = `${state.index + 1} / ${state.files.length}`;
  preloadNext();

  // Re-enable transition and animate into place on next frame.
  requestAnimationFrame(() => {
    cardImg.classList.remove('dragging');
    state.tx = 0;
    applyTransform();
  });

  updateUndoButton();
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
  state.preloader.src = thumbUrl(next.path);
}

function advance({ kept = false, deleted = false, swipeDirection = 0 } = {}) {
  if (kept) state.kept++;
  if (deleted) state.deleted++;
  state.index++;
  renderCurrent({ slideInFrom: swipeDirection ? -swipeDirection : 0 });
}

function finish() {
  doneSummary.textContent = `Kept ${state.kept} · Deleted ${state.deleted}`;
  showView('done');
}

// ---- Swipe + pinch gesture engine ----
const pointers = new Map();
let gestureMode = null;
let pinchStart = null;
let swipeStart = null;
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
      gestureMode = null;
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
    applyTransform({ rotateDeg: dx / 20 });
    const vw = window.innerWidth;
    const threshold = vw * 0.15;
    tintLeft.style.opacity = dx < 0 ? clamp(-dx / threshold, 0, 1) : 0;
    tintRight.style.opacity = dx > 0 ? clamp(dx / threshold, 0, 1) : 0;
  } else if (gestureMode === 'pinch' && pointers.size >= 2) {
    const dist = distanceOf(pointers);
    if (pinchStart.dist > 0) {
      const factor = dist / pinchStart.dist;
      const newScale = clamp(pinchStart.scale * factor, SCALE_MIN, SCALE_MAX);
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
    state.tx += p.x - p.startX;
    state.ty += p.y - p.startY;
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
    if (pointers.size === 1 && state.scale > 1) {
      gestureMode = 'pan';
      const remaining = [...pointers.values()][0];
      remaining.startX = remaining.x;
      remaining.startY = remaining.y;
    } else {
      gestureMode = null;
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

function commitPile(kind) {
  const direction = kind === 'keep' ? 1 : -1;
  const verbPast = kind === 'keep' ? 'Keep' : 'Delete';
  const file = state.files[state.index];
  flyOff(direction);
  fetch(`/api/pile?to=${kind}&path=${encodeURIComponent(file.path)}`, { method: 'POST' })
    .then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const body = await r.json();
      state.undoStack.push({ kind, currentPath: body.newPath, name: file.name });
      const flags = kind === 'keep' ? { kept: true } : { deleted: true };
      setTimeout(() => advance({ ...flags, swipeDirection: direction }), 200);
    })
    .catch((e) => {
      showToast(`${verbPast} failed: ${e.message}`);
      springBack();
    });
}
const commitKeep = () => commitPile('keep');
const commitDelete = () => commitPile('delete');

// ---- Tap & double-tap ----
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
  // Swap thumb for full-res image and enter preview mode.
  state.preview = true;
  cardImg.classList.add('preview');
  const f = state.files[state.index];
  if (f) cardImg.src = imageUrl(f.path);
}
function exitPreview() {
  state.preview = false;
  cardImg.classList.remove('preview');
  state.scale = 1;
  state.tx = 0;
  state.ty = 0;
  applyTransform();
  const f = state.files[state.index];
  if (f) cardImg.src = thumbUrl(f.path);
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

// ---- Undo ----
function updateUndoButton() {
  if (!undoBtn) return;
  undoBtn.classList.toggle('hidden', state.undoStack.length === 0);
}

async function undoLast() {
  const entry = state.undoStack[state.undoStack.length - 1];
  if (!entry) return;
  undoBtn.disabled = true;
  try {
    const res = await fetch(`/api/restore?path=${encodeURIComponent(entry.currentPath)}`, { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    state.undoStack.pop();
    if (entry.kind === 'keep') state.kept = Math.max(0, state.kept - 1);
    else state.deleted = Math.max(0, state.deleted - 1);
    showToast(`Restored ${entry.name}`, 1800, 'success');
  } catch (e) {
    showToast(`Undo failed: ${e.message}`);
  } finally {
    undoBtn.disabled = false;
    updateUndoButton();
  }
}

// ---- Buttons ----
$('placeholder-skip').addEventListener('click', () => advance());
$('placeholder-delete').addEventListener('click', () => commitDelete());
$('browser-back').addEventListener('click', () => {
  showView('folders');
  loadFolders();
});
$('done-back').addEventListener('click', () => {
  showView('folders');
  loadFolders();
});
if (undoBtn) undoBtn.addEventListener('click', undoLast);

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
