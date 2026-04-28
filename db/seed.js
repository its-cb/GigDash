const bcrypt = require('bcryptjs');
const { initDatabase, getDb } = require('./database');

initDatabase();
const db = getDb();

const { count } = db.prepare('SELECT COUNT(*) as count FROM kids').get();
if (count > 0) {
  console.log('Database already seeded — nothing to do.');
  process.exit(0);
}

// Kids — names can be passed via env vars (set by setup.sh on first deploy)
const kid1Name = process.env.KID1_NAME || 'Kid 1';
const kid2Name = process.env.KID2_NAME || 'Kid 2';
const addKid = db.prepare('INSERT INTO kids (name, color) VALUES (?, ?)');
addKid.run(kid1Name, '#3b82f6');
addKid.run(kid2Name, '#ec4899');

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

// Tracking tasks
const addTracking = db.prepare('INSERT INTO tracking_tasks (title, step1_label, step2_label) VALUES (?, ?, ?)');
addTracking.run('Feed the dogs', 'Morning', 'Evening');

// Parent accounts  — passwords: parent123
const hash = bcrypt.hashSync('parent123', 10);
const addParent = db.prepare('INSERT INTO parents (username, password_hash) VALUES (?, ?)');
addParent.run('dad', hash);
addParent.run('mom', hash);

console.log('✅  Database seeded!');
console.log(`    Kids:    ${kid1Name}, ${kid2Name}`);
console.log('    Logins:  dad / parent123   |   mom / parent123');
