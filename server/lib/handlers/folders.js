'use strict';

const path = require('path');

function foldersHandler(config) {
  return (_req, res) => {
    const out = config.roots.map((p) => ({
      name: path.basename(p) || p,
      path: p,
    }));
    res.json(out);
  };
}

module.exports = { foldersHandler };
