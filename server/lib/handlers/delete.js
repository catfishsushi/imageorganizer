'use strict';

const fs = require('fs');
const path = require('path');
const { resolveSafe } = require('../path_guard');
const { ALLOWED_EXT } = require('./files');

function deleteHandler(config, cache) {
  return (req, res, next) => {
    try {
      const requested = req.query.path;
      const abs = resolveSafe(requested, config.roots);
      const ext = path.extname(abs).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return res.status(400).json({ error: 'extension not allowed' });
      }
      const stat = fs.statSync(abs);
      if (!stat.isFile()) {
        return res.status(400).json({ error: 'not a file' });
      }
      // Capture mtime BEFORE delete so we can clean the matching thumb cache entry.
      const mtimeMs = stat.mtimeMs;
      fs.unlinkSync(abs);
      cache.removeFor(abs, mtimeMs);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { deleteHandler };
