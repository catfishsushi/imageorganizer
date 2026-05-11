'use strict';

const path = require('path');
const fs = require('fs');
const { resolveSafe } = require('../path_guard');
const { ALLOWED_EXT } = require('./files');
const { moveToPile, restoreFromPile } = require('../piles');

function pileMoveHandler(config, cache) {
  return (req, res, next) => {
    try {
      const requested = req.query.path;
      const to = req.query.to;
      if (to !== 'keep' && to !== 'delete') {
        return res.status(400).json({ error: 'to must be "keep" or "delete"' });
      }
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
      const newPath = moveToPile(abs, to);
      cache.removeFor(abs, mtimeMs);
      res.status(200).json({ newPath });
    } catch (err) {
      if (err && err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      next(err);
    }
  };
}

function pileRestoreHandler(config, cache) {
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
      const newPath = restoreFromPile(abs);
      cache.removeFor(abs, mtimeMs);
      res.status(200).json({ newPath });
    } catch (err) {
      if (err && err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      next(err);
    }
  };
}

module.exports = { pileMoveHandler, pileRestoreHandler };
