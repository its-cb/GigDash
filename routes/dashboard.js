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
        CASE WHEN gc_me.id IS NOT NULL THEN 1 ELSE 0 END AS completed_by_me,
        (SELECT kid_id FROM gig_completions
         WHERE  task_id = gt.id AND kid_id != ? AND date >= c.cutoff
         LIMIT  1) AS taken_by_kid_id
      FROM gig_tasks gt
      JOIN cutoffs c ON c.id = gt.id
      LEFT JOIN gig_completions gc_me
        ON  gc_me.task_id = gt.id
        AND gc_me.kid_id  = ?
        AND gc_me.date   >= c.cutoff
      WHERE gt.is_active = 1
        AND (gt.kid_id IS NULL OR gt.kid_id = ?)
      ORDER BY gt.value DESC, gt.id
    `).all(kid.id, kid.id, kid.id);

    const { total } = db.prepare(
      'SELECT COALESCE(SUM(value), 0) AS total FROM gig_completions WHERE kid_id = ?'
    ).get(kid.id);

    return { ...kid, dailyTasks, gigTasks, allDailyDone, totalEarnings: total };
  });

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

  res.json({ kids: data, trackingTasks, date });
});

module.exports = router;
