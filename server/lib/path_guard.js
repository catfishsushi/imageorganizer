'use strict';

const fs = require('fs');
const path = require('path');

class PathGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PathGuardError';
    this.status = 403;
  }
}

function normalizeForCompare(p) {
  // Windows paths are case-insensitive. Also collapse mixed separators.
  return path.resolve(p).toLowerCase();
}

function realpathIfExists(p) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
  } catch (_) {
    return null;
  }
}

function isInsideRoot(candidateAbs, rootAbs) {
  const a = normalizeForCompare(candidateAbs);
  const b = normalizeForCompare(rootAbs);
  if (a === b) return true;
  const bWithSep = b.endsWith(path.sep) ? b : b + path.sep;
  return a.startsWith(bWithSep);
}

/**
 * Resolve a user-supplied path safely.
 *   - rejects relative paths, traversal, and mixed-separator escapes
 *   - follows symlinks (via realpath) so a symlink can't point outside roots
 *   - if the path doesn't exist yet, validates the parent dir instead
 *
 * Throws PathGuardError (HTTP 403) when the path escapes all configured roots.
 * Returns the canonical absolute path.
 */
function resolveSafe(requestedPath, roots) {
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) {
    throw new PathGuardError('missing path');
  }

  // Reject null bytes outright.
  if (requestedPath.indexOf('\0') !== -1) {
    throw new PathGuardError('invalid path');
  }

  // Normalize separators and resolve to absolute.
  const abs = path.resolve(requestedPath);

  // If it exists, follow symlinks. Otherwise resolve the parent and re-join.
  let canonical = realpathIfExists(abs);
  if (canonical === null) {
    const parent = realpathIfExists(path.dirname(abs));
    if (parent === null) {
      throw new PathGuardError('path not found');
    }
    canonical = path.join(parent, path.basename(abs));
  }

  for (const root of roots) {
    const rootReal = realpathIfExists(root) || root;
    if (isInsideRoot(canonical, rootReal)) {
      return canonical;
    }
  }
  throw new PathGuardError('path outside configured roots');
}

module.exports = { resolveSafe, PathGuardError };
