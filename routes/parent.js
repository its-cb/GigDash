const express  = require('express');
const { getDb } = require('../db/database');

const router = express.Router();
const today  = () => new Date().toISOString().split('T')[0];

// ── Kids ────────────────────────────────────────────────────────────────────
router.get('/kids', (req, res) => {
  res.json(getDb().prepare('SELECT * FROM kids ORDER BY id').all());
});

// ── Daily tasks ─────────────────────────────────────────────────────────────
router.get('/daily-tasks', (req, res) => {
  const db   = getDb();
  const date = today();
  const tasks = db.prepare(`
    SELECT dt.*,
           k.name AS kid_name,
           GROUP_CONCAT(dc.kid_id) AS completed_by
    FROM   daily_tasks dt
    LEFT   JOIN kids k ON k.id = dt.kid_id
    LEFT   JOIN daily_completions dc ON dc.task_id = dt.id AND dc.date = ?
    GROUP  BY dt.id
    ORDER  BY dt.sort_order, dt.id
  `).all(date);
  res.json(tasks);
});

router.post('/daily-tasks', (req, res) => {
  const { title, kid_id } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  const db  = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO daily_tasks (title, kid_id) VALUES (?, ?)'
  ).run(title.trim(), kid_id || null);
  res.json({ id: lastInsertRowid });
});

router.delete('/daily-tasks/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM daily_completions WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM daily_tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Mark or unmark a daily task complete for a specific kid today
router.post('/daily-tasks/:taskId/complete', (req, res) => {
  const { kid_id, completed, date } = req.body || {};
  const db   = getDb();
  const when = date || today();
  if (completed) {
    db.prepare(
      'INSERT OR IGNORE INTO daily_completions (task_id, kid_id, date) VALUES (?, ?, ?)'
    ).run(req.params.taskId, kid_id, when);
  } else {
    db.prepare(
      'DELETE FROM daily_completions WHERE task_id = ? AND kid_id = ? AND date = ?'
    ).run(req.params.taskId, kid_id, when);
  }
  res.json({ ok: true });
});

// ── Gig tasks ────────────────────────────────────────────────────────────────
router.get('/gig-tasks', (req, res) => {
  const db   = getDb();
  const date = today();
  const tasks = db.prepare(`
    SELECT gt.*,
           k.name AS kid_name,
           GROUP_CONCAT(gc.kid_id) AS completed_by
    FROM   gig_tasks gt
    LEFT   JOIN kids k  ON k.id  = gt.kid_id
    LEFT   JOIN gig_completions gc ON gc.task_id = gt.id AND gc.date = ?
    WHERE  gt.is_active = 1
    GROUP  BY gt.id
    ORDER  BY gt.value DESC, gt.id
  `).all(date);
  res.json(tasks);
});

router.post('/gig-tasks', (req, res) => {
  const { title, value, kid_id } = req.body || {};
  if (!title?.trim())                  return res.status(400).json({ error: 'Title required' });
  if (!value || isNaN(value) || +value <= 0) return res.status(400).json({ error: 'Positive value required' });
  const db = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO gig_tasks (title, value, kid_id) VALUES (?, ?, ?)'
  ).run(title.trim(), parseFloat(value), kid_id || null);
  res.json({ id: lastInsertRowid });
});

// Soft-delete (archive) a gig task
router.delete('/gig-tasks/:id', (req, res) => {
  getDb().prepare('UPDATE gig_tasks SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Mark or unmark a gig task complete for a specific kid today
router.post('/gig-tasks/:taskId/complete', (req, res) => {
  const { kid_id, completed, date } = req.body || {};
  const db   = getDb();
  const when = date || today();
  if (completed) {
    const task = db.prepare('SELECT value FROM gig_tasks WHERE id = ?').get(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    db.prepare(
      'INSERT OR IGNORE INTO gig_completions (task_id, kid_id, date, value) VALUES (?, ?, ?, ?)'
    ).run(req.params.taskId, kid_id, when, task.value);
  } else {
    db.prepare(
      'DELETE FROM gig_completions WHERE task_id = ? AND kid_id = ? AND date = ?'
    ).run(req.params.taskId, kid_id, when);
  }
  res.json({ ok: true });
});

// ── Earnings ─────────────────────────────────────────────────────────────────
router.get('/earnings', (req, res) => {
  const db = getDb();
  const summary = db.prepare(`
    SELECT k.id, k.name, k.color,
           COALESCE(SUM(gc.value), 0) AS total,
           COUNT(gc.id)               AS completions
    FROM   kids k
    LEFT   JOIN gig_completions gc ON gc.kid_id = k.id
    GROUP  BY k.id
    ORDER  BY k.id
  `).all();

  const history = db.prepare(`
    SELECT gc.kid_id, gc.date, SUM(gc.value) AS day_total
    FROM   gig_completions gc
    GROUP  BY gc.kid_id, gc.date
    ORDER  BY gc.date DESC
    LIMIT  60
  `).all();

  res.json({ summary, history });
});

// Cash-out a kid (reset earnings — keeps history with a marker)
router.post('/kids/:kidId/cashout', (req, res) => {
  const db = getDb();
  const { total } = db.prepare(
    'SELECT COALESCE(SUM(value),0) AS total FROM gig_completions WHERE kid_id = ?'
  ).get(req.params.kidId);
  // Delete all completions for this kid (history resets)
  db.prepare('DELETE FROM gig_completions WHERE kid_id = ?').run(req.params.kidId);
  res.json({ ok: true, cashedOut: total });
});

module.exports = router;
