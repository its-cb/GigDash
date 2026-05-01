const Database = require('better-sqlite3');
const path = require('path');

let db;

function initDatabase() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../gigdash.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS kids (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT    NOT NULL,
      color TEXT    NOT NULL DEFAULT '#4CAF50'
    );

    CREATE TABLE IF NOT EXISTS daily_tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      kid_id     INTEGER,              -- NULL = applies to all kids
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (kid_id) REFERENCES kids(id)
    );

    CREATE TABLE IF NOT EXISTS daily_completions (
      id           INTEGER  PRIMARY KEY AUTOINCREMENT,
      task_id      INTEGER  NOT NULL,
      kid_id       INTEGER  NOT NULL,
      date         TEXT     NOT NULL,  -- YYYY-MM-DD
      completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_id, kid_id, date),
      FOREIGN KEY (task_id) REFERENCES daily_tasks(id),
      FOREIGN KEY (kid_id)  REFERENCES kids(id)
    );

    CREATE TABLE IF NOT EXISTS gig_tasks (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      title     TEXT    NOT NULL,
      value     REAL    NOT NULL,
      kid_id    INTEGER,              -- NULL = available to all kids
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (kid_id) REFERENCES kids(id)
    );

    CREATE TABLE IF NOT EXISTS gig_completions (
      id           INTEGER  PRIMARY KEY AUTOINCREMENT,
      task_id      INTEGER  NOT NULL,
      kid_id       INTEGER  NOT NULL,
      date         TEXT     NOT NULL,
      value        REAL     NOT NULL,
      completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_id, kid_id, date),
      FOREIGN KEY (task_id) REFERENCES gig_tasks(id),
      FOREIGN KEY (kid_id)  REFERENCES kids(id)
    );

    CREATE TABLE IF NOT EXISTS parents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    UNIQUE NOT NULL,
      password_hash TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracking_tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      step1_label TEXT    NOT NULL DEFAULT 'Morning',
      step2_label TEXT    NOT NULL DEFAULT 'Evening',
      is_active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracking_completions (
      id           INTEGER  PRIMARY KEY AUTOINCREMENT,
      task_id      INTEGER  NOT NULL,
      step         INTEGER  NOT NULL,   -- 1 or 2
      kid_id       INTEGER,             -- NULL = parent did it
      date         TEXT     NOT NULL,
      completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_id, step, date),
      FOREIGN KEY (task_id) REFERENCES tracking_tasks(id),
      FOREIGN KEY (kid_id)  REFERENCES kids(id)
    );
  `);

  // Migrations
  const gigCols = db.prepare('PRAGMA table_info(gig_tasks)').all().map(c => c.name);
  if (!gigCols.includes('type')) {
    db.exec("ALTER TABLE gig_tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'weekly'");
  }

  const dailyCols = db.prepare('PRAGMA table_info(daily_tasks)').all().map(c => c.name);
  if (!dailyCols.includes('is_trusted')) {
    db.exec('ALTER TABLE daily_tasks ADD COLUMN is_trusted INTEGER NOT NULL DEFAULT 0');
  }

  const parentCols = db.prepare('PRAGMA table_info(parents)').all().map(c => c.name);
  if (!parentCols.includes('recovery_code_hash')) {
    db.exec('ALTER TABLE parents ADD COLUMN recovery_code_hash TEXT');
  }

  return db;
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
