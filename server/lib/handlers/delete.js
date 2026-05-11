'use strict';

const fs = require('fs');
const path = require('path');
const { resolveSafe } = require('../path_guard');
const { ALLOWED_EXT } = require('./files');

function deleteHandler(config, cache, trash) {
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
      const mtimeMs = stat.mtimeMs;
      const { id } = trash.moveIn(abs);
      cache.removeFor(abs, mtimeMs);
      res.status(200).json({ trashId: id });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { deleteHandler };
