'use strict';

const path = require('path');
const express = require('express');

const { loadConfig } = require('../lib/config');
const { PathGuardError } = require('../lib/path_guard');
const { foldersHandler } = require('../lib/handlers/folders');
const { filesHandler } = require('../lib/handlers/files');
const { imageHandler } = require('../lib/handlers/image');
const { thumbHandler } = require('../lib/handlers/thumb');
const { deleteHandler } = require('../lib/handlers/delete');
const { restoreHandler } = require('../lib/handlers/restore');
const { ThumbCache } = require('../lib/thumb_cache');
const { Trash } = require('../lib/trash');

const configPath = path.resolve(__dirname, '..', 'config.json');
let config;
try {
  config = loadConfig(configPath);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const thumbCache = new ThumbCache(config.thumbCacheDir);
const trash = new Trash(config.trashDir);

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');

// Simple request logger.
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

// CORS — local LAN single-user, permissive is fine.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/folders', foldersHandler(config));
app.get('/api/files', filesHandler(config));
app.get('/api/image', imageHandler(config));
app.get('/api/thumb', thumbHandler(config, thumbCache));
app.delete('/api/file', deleteHandler(config, thumbCache, trash));
app.post('/api/restore', restoreHandler(config, trash));

// Static PWA shell. Service worker should never be cached by upstream proxies.
app.use(express.static(PUBLIC_DIR, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('service-worker.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Centralized error handler — translates PathGuardError to 403, anything else to 500.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof PathGuardError) {
    return res.status(403).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const HOST = '0.0.0.0';
app.listen(config.port, HOST, () => {
  console.log(`image-culling server listening on http://${HOST}:${config.port}`);
  console.log(`roots: ${JSON.stringify(config.roots)}`);
  console.log(`thumb cache: ${config.thumbCacheDir}`);
  console.log(`trash: ${config.trashDir}`);
});

module.exports = { app, config };
