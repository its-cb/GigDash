const Database = require('better-sqlite3');
const path = require('path');

let db;

function initDatabase() {
  db = new Database(path.join(__dirname, '../gigdash.db'));
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
  `);

  return db;
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
