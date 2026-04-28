const express  = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

const today = () => new Date().toISOString().split('T')[0];

// Public endpoint — TV dashboard polls this
router.get('/', (req, res) => {
  const db   = getDb();
  const date = today();
  const kids = db.prepare('SELECT * FROM kids ORDER BY id').all();

  const data = kids.map(kid => {
    const dailyTasks = db.prepare(`
      SELECT dt.*,
             CASE WHEN dc.id IS NOT NULL THEN 1 ELSE 0 END AS completed
      FROM   daily_tasks dt
      LEFT   JOIN daily_completions dc
             ON  dc.task_id = dt.id
             AND dc.kid_id  = ?
             AND dc.date    = ?
      WHERE  dt.kid_id IS NULL OR dt.kid_id = ?
      ORDER  BY dt.sort_order, dt.id
    `).all(kid.id, date, kid.id);

    const allDailyDone = dailyTasks.length > 0 && dailyTasks.every(t => t.completed);

    const gigTasks = db.prepare(`
      SELECT gt.*,
             CASE WHEN gc.id IS NOT NULL THEN 1 ELSE 0 END AS completed_today
      FROM   gig_tasks gt
      LEFT   JOIN gig_completions gc
             ON  gc.task_id = gt.id
             AND gc.kid_id  = ?
             AND gc.date    = ?
      WHERE  gt.is_active = 1
             AND (gt.kid_id IS NULL OR gt.kid_id = ?)
      ORDER  BY gt.value DESC, gt.id
    `).all(kid.id, date, kid.id);

    const { total } = db.prepare(
      'SELECT COALESCE(SUM(value), 0) AS total FROM gig_completions WHERE kid_id = ?'
    ).get(kid.id);

    return { ...kid, dailyTasks, gigTasks, allDailyDone, totalEarnings: total };
  });

  res.json({ kids: data, date });
});

module.exports = router;
