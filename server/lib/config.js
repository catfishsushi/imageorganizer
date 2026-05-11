'use strict';

const fs = require('fs');
const path = require('path');

function fail(msg) {
  throw new Error(`config: ${msg}`);
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    fail(`file not found: ${configPath} (copy config.example.json to config.json)`);
  }

  let raw;
  try {
    let text = fs.readFileSync(configPath, 'utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
    raw = JSON.parse(text);
  } catch (e) {
    fail(`invalid JSON in ${configPath}: ${e.message}`);
  }

  const port = Number(raw.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('"port" must be an integer in [1, 65535]');
  }

  if (!Array.isArray(raw.roots) || raw.roots.length === 0) {
    fail('"roots" must be a non-empty array of folder paths');
  }

  const roots = raw.roots.map((r, i) => {
    if (typeof r !== 'string' || !r.trim()) {
      fail(`roots[${i}] must be a non-empty string`);
    }
    const abs = path.resolve(r);
    if (!fs.existsSync(abs)) {
      fail(`roots[${i}] does not exist: ${abs}`);
    }
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) {
      fail(`roots[${i}] is not a directory: ${abs}`);
    }
    return abs;
  });

  if (typeof raw.thumb_cache_dir !== 'string' || !raw.thumb_cache_dir.trim()) {
    fail('"thumb_cache_dir" must be a non-empty string');
  }
  const thumbCacheDir = path.resolve(raw.thumb_cache_dir);

  // trash_dir is optional; defaults to a sibling of thumb_cache_dir.
  let trashDir;
  if (raw.trash_dir == null) {
    trashDir = path.join(path.dirname(thumbCacheDir), 'trash');
  } else {
    if (typeof raw.trash_dir !== 'string' || !raw.trash_dir.trim()) {
      fail('"trash_dir" must be a non-empty string when provided');
    }
    trashDir = path.resolve(raw.trash_dir);
  }

  return { port, roots, thumbCacheDir, trashDir };
}

module.exports = { loadConfig };
