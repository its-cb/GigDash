# GigDashboard

A household chore and earnings tracker for kids. Built for a TV-connected display with a mobile parent control panel.

![Docker](https://img.shields.io/badge/docker-itscb%2Fgigdash-blue?logo=docker)

## Features

- **TV Dashboard** — full-screen two-column display, one column per kid
- **Daily Expectations** — tasks that must be completed before gig tasks unlock
- **Gig Tasks** — paid chores with dollar values; first-come-first-serve between kids
  - Weekly (rolling 7 days), Bi-weekly (14 days), or Permanent types
- **Tracking Tasks** — two-step non-gating tasks (e.g. Feed the dogs — Morning / Evening)
- **Piggy Bank** — running earnings total per kid with cash-out support
- **Parent Dashboard** — mobile-friendly web app with JWT login

---

## Running with Docker

### Quick start

```bash
curl -O https://raw.githubusercontent.com/itscb/gigdash/main/docker-compose.yml
JWT_SECRET=$(openssl rand -hex 32) docker-compose up -d
```

The app will be available at:
- TV Dashboard → `http://<host-ip>:3000/tv`
- Parent Panel → `http://<host-ip>:3000/parent`

### First-time setup

After the container starts, seed the database with your kids' names, default tasks, and parent logins:

```bash
docker exec -e KID1_NAME="Alex" -e KID2_NAME="Jordan" gigdash node db/seed.js
```

Replace `Alex` and `Jordan` with your kids' names. This only needs to be run once — the database persists in a Docker volume and won't be re-seeded on updates.

Default logins: `dad / parent123` and `mom / parent123` — change these after first login.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `JWT_SECRET` | `change-me-in-production` | Secret for signing auth tokens — **always set this** |
| `DB_PATH` | `/app/data/gigdash.db` | Path to the SQLite database file |

### Updating

```bash
docker-compose pull && docker-compose up -d
```

The database is stored in a Docker volume (`gigdash-data`) and survives updates.

---

## Running without Docker

### Deploy to a Debian/Linux box from your Mac (recommended)

This is the simplest path for a dedicated device — a mini PC, NUC, or anything connected to a TV.

**1. Clone the repo on your Mac**
```bash
git clone https://github.com/itscb/gigdash.git
cd gigdash
```

**2. Add a shell alias for easy deploys**
```bash
echo 'alias deploygigdash="bash ~/path/to/gigdash/deploy.sh"' >> ~/.zshrc
source ~/.zshrc
```

**3. Install Debian 13 on your device** with only the SSH server option selected. Make sure it's on the same network as your Mac.

**4. Run the deploy script**
```bash
deploygigdash <device-ip> <username>
# Example: deploygigdash 192.168.1.50 gigdash
```

This zips the project, transfers it to the device, and runs the full setup automatically. On first install it will ask for your kids' names, then handle everything else — Node.js, dependencies, systemd service, and Chromium kiosk mode.

**5. On subsequent updates**, just pull and redeploy:
```bash
git pull && deploygigdash <device-ip> <username>
```

The database is preserved between deploys — only code files are updated.

See [SETUP.md](SETUP.md) for full details including systemd configuration, kiosk mode, and optional nginx setup.

---

## Managing kids

Kid names are set once during first-time setup and stored in the database. To rename a kid or add one after the fact, use the commands below.

### Rename a kid

**Docker:**
```bash
docker exec gigdash node -e "
const { initDatabase, getDb } = require('./db/database');
initDatabase();
getDb().prepare('UPDATE kids SET name = ? WHERE id = ?').run('NewName', 1);
console.log('Done — refresh the TV dashboard');
"
```

**Systemd (non-Docker):**
```bash
cd /opt/gigdash
node -e "
const { initDatabase, getDb } = require('./db/database');
initDatabase();
getDb().prepare('UPDATE kids SET name = ? WHERE id = ?').run('NewName', 1);
console.log('Done — refresh the TV dashboard');
"
```

Replace `'NewName'` with the new name and `1` with the kid's ID (`1` = first kid, `2` = second kid).

### Add a kid

```bash
# Docker
docker exec gigdash node -e "
const { initDatabase, getDb } = require('./db/database');
initDatabase();
getDb().prepare('INSERT INTO kids (name, color) VALUES (?, ?)').run('NewKid', '#10b981');
console.log('Done');
"
```

> **Note:** The TV dashboard uses a two-column layout. Adding a third kid will display correctly but may feel cramped — a three-column layout update would be needed for the best experience.

---

## Tech stack

- **Backend** — Node.js, Express, SQLite (better-sqlite3)
- **Auth** — JWT + bcrypt
- **Frontend** — Vanilla HTML/CSS/JS (no build step)
- **Database** — SQLite, auto-migrated on startup
