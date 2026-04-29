// Load .env if present (written by setup.sh on first deploy)
const fs = require('fs');
const envPath = require('path').join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { execSync } = require('child_process');
const { initDatabase } = require('./db/database');

function gitExec(cmd) {
  return execSync(cmd, { cwd: __dirname, encoding: 'utf8', timeout: 30000 }).trim();
}

function hasGit() {
  try { gitExec('git rev-parse --git-dir'); return true; } catch { return false; }
}

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

// Push signal — triggers immediate TV data refresh
let lastPush = Date.now();
app.get( '/api/push', (_req, res) => res.json({ ts: lastPush }));
app.post('/api/push', require('./middleware/auth'), (_req, res) => {
  lastPush = Date.now();
  res.json({ ts: lastPush });
});

// TV reload signal — triggers full page reload on the TV
let lastReload = 0;
app.get( '/api/admin/tv-reload', (_req, res) => res.json({ ts: lastReload }));
app.post('/api/admin/tv-reload', require('./middleware/auth'), (_req, res) => {
  lastReload = Date.now();
  res.json({ ts: lastReload });
});

// System controls
app.post('/api/admin/reboot',   require('./middleware/auth'), (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => { try { execSync('sudo reboot'); } catch {} }, 500);
});
app.post('/api/admin/shutdown', require('./middleware/auth'), (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => { try { execSync('sudo shutdown -h now'); } catch {} }, 500);
});

// Update endpoints
app.get('/api/admin/update/check', require('./middleware/auth'), (_req, res) => {
  if (!hasGit()) return res.json({ unsupported: true });
  try {
    gitExec('git fetch origin main -q');
    const changes = gitExec('git log HEAD..origin/main --oneline');
    const current = gitExec('git rev-parse --short HEAD');
    res.json({ upToDate: !changes, changes: changes || null, current });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/update/apply', require('./middleware/auth'), (_req, res) => {
  if (!hasGit()) return res.status(400).json({ error: 'Update button not available — use deploygigdash instead' });
  try {
    gitExec('git fetch origin main -q');
    const changes = gitExec('git log HEAD..origin/main --oneline');
    if (!changes) return res.json({ upToDate: true });
    gitExec('git reset --hard origin/main -q');
    execSync('npm install --omit=dev -q', { cwd: __dirname, timeout: 120000 });
    res.json({ ok: true, changes });
    // Restart after response is sent
    setTimeout(() => {
      try { execSync('sudo systemctl restart gigdash'); } catch {}
    }, 800);
  } catch (e) {
    res.status(500).json({
      error: e.message,
      detail: (e.stderr || e.stdout || '').toString().trim()
    });
  }
});

initDatabase();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯  GigDashboard is running\n`);
  console.log(`    TV Dashboard   → http://localhost:${PORT}/tv`);
  console.log(`    Parent Panel   → http://localhost:${PORT}/parent`);
  console.log(`    API            → http://localhost:${PORT}/api\n`);
});
