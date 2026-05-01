// Load .env if present (written by setup.sh on first deploy)
const fs = require('fs');
const envPath = require('path').join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const { execSync, execFileSync } = require('child_process');
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
app.use('/kids',   express.static(path.join(__dirname, 'public/kids')));
app.get('/', (_req, res) => res.redirect('/tv'));

// API
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/parent',     require('./middleware/auth'), require('./routes/parent'));
app.use('/api/kids-panel', require('./routes/kids-panel'));

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

// System controls — not supported in Docker
const isDocker = require('fs').existsSync('/.dockerenv');

app.post('/api/admin/reboot',   require('./middleware/auth'), (_req, res) => {
  if (isDocker) return res.status(400).json({ error: 'Not supported in Docker' });
  res.json({ ok: true });
  setTimeout(() => { try { execSync('sudo reboot'); } catch {} }, 500);
});
app.post('/api/admin/shutdown', require('./middleware/auth'), (_req, res) => {
  if (isDocker) return res.status(400).json({ error: 'Not supported in Docker' });
  res.json({ ok: true });
  setTimeout(() => {
    for (const cmd of ['sudo systemctl poweroff', 'sudo poweroff', 'sudo shutdown -h now']) {
      try { execSync(cmd); break; } catch {}
    }
  }, 500);
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

// ── WiFi management ──────────────────────────────────────────────────────────
function nmcliAvailable() {
  try { execFileSync('which', ['nmcli']); return true; } catch { return false; }
}

app.get('/api/admin/wifi/status', require('./middleware/auth'), (_req, res) => {
  if (isDocker || !nmcliAvailable()) return res.json({ unsupported: true });
  try {
    const out = execSync('nmcli -t -f NAME,TYPE,DEVICE,STATE con show --active', { encoding: 'utf8' });
    const connections = out.trim().split('\n').filter(Boolean).map(line => {
      const [name, type, device, state] = line.split(':');
      return { name, type, device, state };
    });
    res.json({ connections });
  } catch { res.json({ connections: [] }); }
});

app.get('/api/admin/wifi/scan', require('./middleware/auth'), (_req, res) => {
  if (isDocker || !nmcliAvailable()) return res.json({ unsupported: true });
  try {
    try { execFileSync('sudo', ['nmcli', 'dev', 'wifi', 'rescan'], { timeout: 5000 }); } catch {}
    const out = execSync('nmcli --escape no -t -f SSID,SIGNAL,SECURITY dev wifi list', { encoding: 'utf8', timeout: 15000 });
    const seen = new Set();
    const networks = out.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(':');
      const security = parts.pop();
      const signal   = parseInt(parts.pop()) || 0;
      const ssid     = parts.join(':').trim();
      return { ssid, signal, security: security.trim() };
    })
    .filter(n => n.ssid && !seen.has(n.ssid) && seen.add(n.ssid))
    .sort((a, b) => b.signal - a.signal);
    res.json({ networks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/wifi/connect', require('./middleware/auth'), (req, res) => {
  if (isDocker || !nmcliAvailable()) return res.status(400).json({ error: 'Not supported' });
  const { ssid, password } = req.body || {};
  if (!ssid?.trim()) return res.status(400).json({ error: 'SSID required' });
  try {
    // Remove any existing profile for this SSID
    try { execFileSync('sudo', ['nmcli', 'con', 'delete', ssid.trim()], { timeout: 5000 }); } catch {}
    const args = ['dev', 'wifi', 'connect', ssid.trim()];
    if (password) args.push('password', password);
    execFileSync('sudo', ['nmcli', ...args], { timeout: 30000 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({
      error: 'Connection failed',
      detail: (e.stderr || e.stdout || e.message || '').toString().trim()
    });
  }
});

// ── Display sleep schedule ───────────────────────────────────────────────────
let displaySchedule = { enabled: false, sleepTime: '22:00', wakeTime: '06:00' };

function loadDisplaySchedule() {
  try {
    const db = require('./db/database').getDb();
    db.prepare("SELECT key, value FROM settings WHERE key IN ('display_schedule_enabled','display_sleep_time','display_wake_time')")
      .all().forEach(({ key, value }) => {
        if (key === 'display_schedule_enabled') displaySchedule.enabled  = value === '1';
        if (key === 'display_sleep_time')       displaySchedule.sleepTime = value;
        if (key === 'display_wake_time')        displaySchedule.wakeTime  = value;
      });
  } catch {}
}

function setDisplay(on) {
  const cmd = on ? 'xset dpms force on && xset s reset' : 'xset dpms force off';
  try { execSync(`DISPLAY=:0 ${cmd}`, { timeout: 3000 }); } catch {}
}

function checkDisplaySchedule() {
  if (!displaySchedule.enabled) return;
  const now   = new Date();
  const curr  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const { sleepTime, wakeTime } = displaySchedule;
  // Crossing midnight (e.g. sleep=22:00 wake=06:00) vs same day (sleep=13:00 wake=15:00)
  const shouldSleep = sleepTime > wakeTime
    ? curr >= sleepTime || curr < wakeTime
    : curr >= sleepTime && curr < wakeTime;
  setDisplay(!shouldSleep);
}

app.get('/api/admin/display-schedule', require('./middleware/auth'), (_req, res) => {
  res.json({ ...displaySchedule });
});

app.post('/api/admin/display-schedule', require('./middleware/auth'), (req, res) => {
  const { enabled, sleepTime, wakeTime } = req.body || {};
  const db = require('./db/database').getDb();
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  upsert.run('display_schedule_enabled', enabled ? '1' : '0');
  if (sleepTime) upsert.run('display_sleep_time', sleepTime);
  if (wakeTime)  upsert.run('display_wake_time',  wakeTime);
  displaySchedule = {
    enabled:   !!enabled,
    sleepTime: sleepTime || displaySchedule.sleepTime,
    wakeTime:  wakeTime  || displaySchedule.wakeTime
  };
  checkDisplaySchedule(); // apply immediately
  res.json({ ok: true });
});

initDatabase();
loadDisplaySchedule();
setInterval(checkDisplaySchedule, 60000); // check every minute

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯  GigDashboard is running\n`);
  console.log(`    TV Dashboard   → http://localhost:${PORT}/tv`);
  console.log(`    Parent Panel   → http://localhost:${PORT}/parent`);
  console.log(`    API            → http://localhost:${PORT}/api\n`);
});
