'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class ThumbCache {
  constructor(dir) {
    this.dir = dir;
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  key(absPath, mtimeMs) {
    return crypto.createHash('sha1').update(`${absPath}:${mtimeMs}`).digest('hex');
  }

  pathFor(absPath, mtimeMs) {
    return path.join(this.dir, `${this.key(absPath, mtimeMs)}.jpg`);
  }

  hit(absPath, mtimeMs) {
    const p = this.pathFor(absPath, mtimeMs);
    return fs.existsSync(p) ? p : null;
  }

  removeFor(absPath, mtimeMs) {
    const p = this.pathFor(absPath, mtimeMs);
    try {
      fs.unlinkSync(p);
      return true;
    } catch (_) {
      return false;
    }
  }
}

module.exports = { ThumbCache };
