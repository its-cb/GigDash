const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDb } = require('../db/database');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'gigdash-change-me-in-production';

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const parent = db.prepare('SELECT * FROM parents WHERE username = ?').get(username.trim());
  if (!parent || !bcrypt.compareSync(password, parent.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { id: parent.id, username: parent.username },
    SECRET,
    { expiresIn: '14d' }
  );
  res.json({ token, username: parent.username });
});

module.exports = router;
