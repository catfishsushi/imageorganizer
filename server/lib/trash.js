'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Move-to-trash with sidecar JSON for restore. Cross-volume safe (falls back to
// copy + unlink on EXDEV).
//
// Layout:
//   <trash_dir>/<id><ext>        — original file bytes
//   <trash_dir>/<id>.json        — { originalPath, deletedAt }

class Trash {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  newId() {
    return crypto.randomBytes(12).toString('hex');
  }

  pathFor(id, ext) {
    return path.join(this.dir, id + ext);
  }

  metaPathFor(id) {
    return path.join(this.dir, id + '.json');
  }

  moveIn(absPath) {
    const id = this.newId();
    const ext = path.extname(absPath);
    const target = this.pathFor(id, ext);

    try {
      fs.renameSync(absPath, target);
    } catch (err) {
      if (err.code === 'EXDEV') {
        // Cross-volume — copy then unlink.
        fs.copyFileSync(absPath, target);
        fs.unlinkSync(absPath);
      } else {
        throw err;
      }
    }

    const meta = {
      originalPath: absPath,
      ext,
      deletedAt: Date.now(),
    };
    fs.writeFileSync(this.metaPathFor(id), JSON.stringify(meta), 'utf8');
    return { id, ext };
  }

  // Restores the trashed file back to its original location.
  // Throws if the metadata is missing, the trash payload is missing, or the
  // destination already exists.
  restore(id) {
    const metaPath = this.metaPathFor(id);
    if (!fs.existsSync(metaPath)) {
      const e = new Error('trash entry not found');
      e.status = 404;
      throw e;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const payload = this.pathFor(id, meta.ext);
    if (!fs.existsSync(payload)) {
      const e = new Error('trash payload missing');
      e.status = 410;
      throw e;
    }
    if (fs.existsSync(meta.originalPath)) {
      const e = new Error('destination already exists');
      e.status = 409;
      throw e;
    }
    // Make sure the destination directory still exists.
    fs.mkdirSync(path.dirname(meta.originalPath), { recursive: true });

    try {
      fs.renameSync(payload, meta.originalPath);
    } catch (err) {
      if (err.code === 'EXDEV') {
        fs.copyFileSync(payload, meta.originalPath);
        fs.unlinkSync(payload);
      } else {
        throw err;
      }
    }
    fs.unlinkSync(metaPath);
    return meta.originalPath;
  }
}

module.exports = { Trash };
