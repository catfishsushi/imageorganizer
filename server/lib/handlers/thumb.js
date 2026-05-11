'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { resolveSafe } = require('../path_guard');
const { ALLOWED_EXT } = require('./files');

const LONG_EDGE = 400;
const JPEG_QUALITY = 80;

function thumbHandler(config, cache) {
  return async (req, res, next) => {
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

      const cachedPath = cache.hit(abs, stat.mtimeMs);
      if (cachedPath) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Thumb-Cache', 'hit');
        return fs.createReadStream(cachedPath).pipe(res);
      }

      const outPath = cache.pathFor(abs, stat.mtimeMs);
      // Generate to disk, then stream out.
      await sharp(abs, { failOn: 'none' })
        .rotate()
        .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(outPath);

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Thumb-Cache', 'miss');
      fs.createReadStream(outPath).pipe(res);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { thumbHandler };
