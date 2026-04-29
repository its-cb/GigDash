const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDb } = require('../db/database');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'gigdash-change-me-in-production';

function makeToken(parent) {
  return jwt.sign({ id: parent.id, username: parent.username }, SECRET, { expiresIn: '14d' });
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const db     = getDb();
  const parent = db.prepare('SELECT * FROM parents WHERE username = ?').get(username.trim());
  if (!parent || !bcrypt.compareSync(password, parent.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({ token: makeToken(parent), username: parent.username });
});

// Reset password using a recovery code
router.post('/recover', (req, res) => {
  const { username, recovery_code, new_password } = req.body || {};
  if (!username || !recovery_code || !new_password) {
    return res.status(400).json({ error: 'Username, recovery code, and new password required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const db     = getDb();
  const parent = db.prepare('SELECT * FROM parents WHERE username = ?').get(username.trim());
  if (!parent || !parent.recovery_code_hash) {
    return res.status(401).json({ error: 'Invalid username or recovery code' });
  }
  // Normalise code — strip dashes, uppercase
  const code = recovery_code.replace(/-/g, '').toUpperCase();
  if (!bcrypt.compareSync(code, parent.recovery_code_hash)) {
    return res.status(401).json({ error: 'Invalid username or recovery code' });
  }
  // Valid — update password and invalidate the recovery code
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE parents SET password_hash = ?, recovery_code_hash = NULL WHERE id = ?')
    .run(hash, parent.id);
  res.json({ token: makeToken(parent), username: parent.username });
});

module.exports = router;
