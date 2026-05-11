'use strict';

const fs = require('fs');
const path = require('path');

// Pile model: when a user makes a keep/delete decision in a folder, the file
// is *moved* into a sibling subfolder of that folder — `_kept` or `_deleted`.
// This way the source folder shrinks as you cull, and restarting picks up only
// undecided files.

const PILE_NAMES = {
  keep: '_kept',
  delete: '_deleted',
};
const PILE_SET = new Set(Object.values(PILE_NAMES));

function pileNameFor(kind) {
  return PILE_NAMES[kind];
}

function moveCrossVolumeSafe(src, dst) {
  try {
    fs.renameSync(src, dst);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dst);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
}

// Find a free filename in `dir` by appending -1, -2, ... before the extension
// if `<dir>/<basename>` is taken. Pure: doesn't touch disk.
function findFreeName(dir, basename) {
  const candidate = path.join(dir, basename);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(basename);
  const stem = basename.slice(0, basename.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const next = path.join(dir, `${stem}-${i}${ext}`);
    if (!fs.existsSync(next)) return next;
  }
  throw new Error(`could not find a free name for ${basename} in ${dir}`);
}

// Move a file into the pile subfolder of its current directory. Returns the
// final absolute path (auto-renamed on collision).
function moveToPile(absPath, kind) {
  const pileName = pileNameFor(kind);
  if (!pileName) {
    const e = new Error(`unknown pile kind: ${kind}`);
    e.status = 400;
    throw e;
  }
  const parent = path.dirname(absPath);
  const pileDir = path.join(parent, pileName);
  fs.mkdirSync(pileDir, { recursive: true });
  const dest = findFreeName(pileDir, path.basename(absPath));
  moveCrossVolumeSafe(absPath, dest);
  return dest;
}

// Move a file out of its pile back to the parent of the pile dir.
function restoreFromPile(absPath) {
  const parent = path.dirname(absPath);
  const parentName = path.basename(parent);
  if (!PILE_SET.has(parentName)) {
    const e = new Error('file is not in a pile');
    e.status = 400;
    throw e;
  }
  const grandparent = path.dirname(parent);
  const dest = findFreeName(grandparent, path.basename(absPath));
  moveCrossVolumeSafe(absPath, dest);
  return dest;
}

module.exports = { moveToPile, restoreFromPile, PILE_NAMES };
