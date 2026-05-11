'use strict';

function restoreHandler(_config, trash) {
  return (req, res, next) => {
    try {
      const id = req.query.id;
      if (typeof id !== 'string' || !/^[a-f0-9]{16,64}$/.test(id)) {
        return res.status(400).json({ error: 'invalid trash id' });
      }
      const restoredPath = trash.restore(id);
      res.status(200).json({ path: restoredPath });
    } catch (err) {
      if (err && err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      next(err);
    }
  };
}

module.exports = { restoreHandler };
