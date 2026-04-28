// Load .env if present (written by setup.sh on first deploy)
const fs = require('fs');
const envPath = require('path').join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDatabase } = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Static assets
app.use('/tv',     express.static(path.join(__dirname, 'public/tv')));
app.use('/parent', express.static(path.join(__dirname, 'public/parent')));
app.get('/', (_req, res) => res.redirect('/tv'));

// API
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/parent',    require('./middleware/auth'), require('./routes/parent'));

// Push signal — lets the parent app trigger an immediate TV refresh
let lastPush = Date.now();
app.get( '/api/push', (_req, res) => res.json({ ts: lastPush }));
app.post('/api/push', require('./middleware/auth'), (_req, res) => {
  lastPush = Date.now();
  res.json({ ts: lastPush });
});

initDatabase();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯  GigDashboard is running\n`);
  console.log(`    TV Dashboard   → http://localhost:${PORT}/tv`);
  console.log(`    Parent Panel   → http://localhost:${PORT}/parent`);
  console.log(`    API            → http://localhost:${PORT}/api\n`);
});
