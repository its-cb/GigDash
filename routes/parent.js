const express  = require('express');
const { getDb } = require('../db/database');

const router = express.Router();
const today  = () => new Date().toISOString().split('T')[0];

function gigCutoff(type) {
  const now = new Date();
  if (type === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7); // rolling 7 days
    return d.toISOString().split('T')[0];
  }
  if (type === 'biweekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  }
  return '0000-01-01'; // permanent — window is all time
}

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
  const db    = getDb();
  const tasks = db.prepare(`
    WITH cutoffs AS (
      SELECT id,
        CASE type
          WHEN 'weekly'   THEN date('now', '-7 days')
          WHEN 'biweekly' THEN date('now', '-14 days')
          ELSE '0000-01-01'
        END AS cutoff
      FROM gig_tasks
    )
    SELECT gt.*,
           k.name AS kid_name,
           GROUP_CONCAT(gc.kid_id) AS completed_by,
           (SELECT kid_id FROM gig_completions
            WHERE  task_id = gt.id AND date >= c.cutoff
            LIMIT  1) AS taken_by_kid_id
    FROM   gig_tasks gt
    JOIN   cutoffs c ON c.id = gt.id
    LEFT   JOIN kids k ON k.id = gt.kid_id
    LEFT   JOIN gig_completions gc ON gc.task_id = gt.id AND gc.date >= c.cutoff
    WHERE  gt.is_active = 1
    GROUP  BY gt.id
    ORDER  BY gt.type, gt.value DESC, gt.id
  `).all();
  res.json(tasks);
});

router.post('/gig-tasks', (req, res) => {
  const { title, value, kid_id, type } = req.body || {};
  if (!title?.trim())                        return res.status(400).json({ error: 'Title required' });
  if (!value || isNaN(value) || +value <= 0) return res.status(400).json({ error: 'Positive value required' });
  const validTypes = ['weekly', 'biweekly', 'permanent'];
  const taskType   = validTypes.includes(type) ? type : 'weekly';
  const db = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO gig_tasks (title, value, kid_id, type) VALUES (?, ?, ?, ?)'
  ).run(title.trim(), parseFloat(value), kid_id || null, taskType);
  res.json({ id: lastInsertRowid });
});

// Soft-delete (archive) a gig task
router.delete('/gig-tasks/:id', (req, res) => {
  getDb().prepare('UPDATE gig_tasks SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Mark or unmark a gig task complete for a specific kid (first-come-first-serve)
router.post('/gig-tasks/:taskId/complete', (req, res) => {
  const { kid_id, completed } = req.body || {};
  const db   = getDb();
  const task = db.prepare('SELECT * FROM gig_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const cutoff = gigCutoff(task.type);

  if (completed) {
    // First-come-first-serve: block if another kid already claimed it
    const taken = db.prepare(
      'SELECT kid_id FROM gig_completions WHERE task_id = ? AND kid_id != ? AND date >= ? LIMIT 1'
    ).get(req.params.taskId, kid_id, cutoff);
    if (taken) {
      const taker = db.prepare('SELECT name FROM kids WHERE id = ?').get(taken.kid_id);
      return res.status(409).json({ error: `Already claimed by ${taker?.name || 'sibling'}` });
    }
    db.prepare(
      'INSERT OR IGNORE INTO gig_completions (task_id, kid_id, date, value) VALUES (?, ?, ?, ?)'
    ).run(req.params.taskId, kid_id, today(), task.value);
  } else {
    // Delete any completion within the window (handles all types correctly)
    db.prepare(
      'DELETE FROM gig_completions WHERE task_id = ? AND kid_id = ? AND date >= ?'
    ).run(req.params.taskId, kid_id, cutoff);
  }
  res.json({ ok: true });
});

// ── Tracking tasks ───────────────────────────────────────────────────────────
router.get('/tracking-tasks', (req, res) => {
  const db   = getDb();
  const date = today();
  const tasks = db.prepare(`
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
  res.json(tasks);
});

router.post('/tracking-tasks', (req, res) => {
  const { title, step1_label, step2_label } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  const db = getDb();
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO tracking_tasks (title, step1_label, step2_label) VALUES (?, ?, ?)'
  ).run(title.trim(), step1_label?.trim() || 'Morning', step2_label?.trim() || 'Evening');
  res.json({ id: lastInsertRowid });
});

router.delete('/tracking-tasks/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tracking_completions WHERE task_id = ?').run(req.params.id);
  db.prepare('UPDATE tracking_tasks SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Mark a tracking step — kid_id null means parent did it
// Using INSERT OR REPLACE so clicking a different person switches the assignment
router.post('/tracking-tasks/:taskId/step/:step/complete', (req, res) => {
  const { kid_id, completed } = req.body || {};
  const step = parseInt(req.params.step);
  if (![1, 2].includes(step)) return res.status(400).json({ error: 'Step must be 1 or 2' });
  const db   = getDb();
  const date = today();
  if (completed) {
    db.prepare(
      'INSERT OR REPLACE INTO tracking_completions (task_id, step, kid_id, date) VALUES (?, ?, ?, ?)'
    ).run(req.params.taskId, step, kid_id ?? null, date);
  } else {
    db.prepare(
      'DELETE FROM tracking_completions WHERE task_id = ? AND step = ? AND date = ?'
    ).run(req.params.taskId, step, date);
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
