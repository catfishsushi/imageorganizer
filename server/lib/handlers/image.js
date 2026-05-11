'use strict';

const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { resolveSafe } = require('../path_guard');
const { ALLOWED_EXT } = require('./files');

function imageHandler(config) {
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
      const type = mime.lookup(abs) || 'application/octet-stream';
      res.setHeader('Content-Type', type);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      fs.createReadStream(abs).pipe(res);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { imageHandler };
