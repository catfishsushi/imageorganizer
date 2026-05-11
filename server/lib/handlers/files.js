'use strict';

const fs = require('fs');
const path = require('path');
const { resolveSafe } = require('../path_guard');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

function isHidden(name) {
  return name.startsWith('.');
}

function filesHandler(config) {
  return (req, res, next) => {
    try {
      const requested = req.query.path;
      const dir = resolveSafe(requested, config.roots);

      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: 'path is not a directory' });
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (isHidden(entry.name)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) continue;

        const abs = path.join(dir, entry.name);
        let s;
        try {
          s = fs.statSync(abs);
        } catch (_) {
          continue;
        }
        // Skip hidden/system on Windows where available.
        files.push({
          name: entry.name,
          path: abs,
          size: s.size,
          mtime: s.mtimeMs,
        });
      }
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
      res.json(files);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { filesHandler, ALLOWED_EXT };
