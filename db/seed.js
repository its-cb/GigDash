const bcrypt = require('bcryptjs');
const { initDatabase, getDb } = require('./database');

initDatabase();
const db = getDb();

const { count } = db.prepare('SELECT COUNT(*) as count FROM kids').get();
if (count > 0) {
  console.log('Database already seeded — nothing to do.');
  process.exit(0);
}

// Kids
const addKid = db.prepare('INSERT INTO kids (name, color) VALUES (?, ?)');
const kayden = addKid.run('Kayden', '#3b82f6');
const monroe  = addKid.run('Monroe',  '#ec4899');

// Shared daily expectations
const addDaily = db.prepare('INSERT INTO daily_tasks (title, kid_id, sort_order) VALUES (?, NULL, ?)');
addDaily.run('Make your bed',       1);
addDaily.run('Brush your teeth',    2);
addDaily.run('Get dressed',         3);
addDaily.run('Put away your shoes', 4);

// Gig tasks (shared)
const addGig = db.prepare('INSERT INTO gig_tasks (title, value, kid_id) VALUES (?, ?, NULL)');
addGig.run('Vacuum the living room',       2.00);
addGig.run('Wash & dry the dishes',        1.50);
addGig.run('Take out the trash',           1.00);
addGig.run('Sweep the kitchen floor',      1.00);
addGig.run('Wipe down kitchen counters',   1.00);
addGig.run('Clean the bathroom sink',      1.50);
addGig.run('Fold & put away laundry',      2.00);
addGig.run('Feed the pet',                 0.50);

// Parent accounts  — passwords: parent123
const hash = bcrypt.hashSync('parent123', 10);
const addParent = db.prepare('INSERT INTO parents (username, password_hash) VALUES (?, ?)');
addParent.run('dad', hash);
addParent.run('mom', hash);

console.log('✅  Database seeded!');
console.log('    Kids:    Kayden, Monroe');
console.log('    Logins:  dad / parent123   |   mom / parent123');
