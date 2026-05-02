const express  = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// Public — no auth. Tablet is a trusted device on the home network.
router.get('/', (req, res) => {
  const db   = getDb();
  const date = today();
  const kids = db.prepare('SELECT * FROM kids ORDER BY id').all();

  const dailyTasks = db.prepare(`
    SELECT dt.*,
      GROUP_CONCAT(dc.kid_id) AS completed_by
    FROM   daily_tasks dt
    LEFT   JOIN daily_completions dc ON dc.task_id = dt.id AND dc.date = ?
    WHERE  dt.is_trusted = 1
    GROUP  BY dt.id
    ORDER  BY dt.sort_order, dt.id
  `).all(date);

  const trackingTasks = db.prepare(`
    SELECT tt.*,
      CASE WHEN tc1.id IS NOT NULL THEN 1 ELSE 0 END AS step1_done,
      tc1.kid_id AS step1_kid_id,
      CASE WHEN tc2.id IS NOT NULL THEN 1 ELSE 0 END AS step2_done,
      tc2.kid_id AS step2_kid_id
    FROM   tracking_tasks tt
    LEFT   JOIN tracking_completions tc1 ON tc1.task_id = tt.id AND tc1.step = 1 AND tc1.date = ?
    LEFT   JOIN tracking_completions tc2 ON tc2.task_id = tt.id AND tc2.step = 2 AND tc2.date = ?
    WHERE  tt.is_active = 1
    ORDER  BY tt.id
  `).all(date, date);

  res.json({ kids, dailyTasks, trackingTasks, date });
});

// Mark a trusted daily task complete for a kid. Joint tasks mark/unmark all kids at once.
router.post('/daily/:taskId/complete', (req, res) => {
  const { kid_id, completed } = req.body || {};
  const db   = getDb();
  const date = today();

  const task = db.prepare('SELECT id, is_joint FROM daily_tasks WHERE id = ? AND is_trusted = 1').get(req.params.taskId);
  if (!task) return res.status(403).json({ error: 'Task not available for self-completion' });

  if (completed) {
    if (task.is_joint) {
      const insert = db.prepare('INSERT OR IGNORE INTO daily_completions (task_id, kid_id, date) VALUES (?, ?, ?)');
      db.prepare('SELECT id FROM kids').all().forEach(k => insert.run(req.params.taskId, k.id, date));
    } else {
      db.prepare('INSERT OR IGNORE INTO daily_completions (task_id, kid_id, date) VALUES (?, ?, ?)')
        .run(req.params.taskId, kid_id, date);
    }
  } else {
    if (task.is_joint) {
      db.prepare('DELETE FROM daily_completions WHERE task_id = ? AND date = ?')
        .run(req.params.taskId, date);
    } else {
      db.prepare('DELETE FROM daily_completions WHERE task_id = ? AND kid_id = ? AND date = ?')
        .run(req.params.taskId, kid_id, date);
    }
  }
  res.json({ ok: true });
});

// Mark a tracking step (kid_id null = parent did it)
router.post('/tracking/:taskId/step/:step/complete', (req, res) => {
  const { kid_id, completed } = req.body || {};
  const step = parseInt(req.params.step);
  if (![1, 2].includes(step)) return res.status(400).json({ error: 'Step must be 1 or 2' });
  const db   = getDb();
  const date = today();

  if (completed) {
    db.prepare('INSERT OR REPLACE INTO tracking_completions (task_id, step, kid_id, date) VALUES (?, ?, ?, ?)')
      .run(req.params.taskId, step, kid_id ?? null, date);
  } else {
    db.prepare('DELETE FROM tracking_completions WHERE task_id = ? AND step = ? AND date = ?')
      .run(req.params.taskId, step, date);
  }
  res.json({ ok: true });
});

module.exports = router;
