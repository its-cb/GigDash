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

After the container starts, seed the database with default kids, tasks, and parent logins:

```bash
docker exec gigdash node db/seed.js
```

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

Requires Node.js 20+.

```bash
npm install
npm run seed
npm start
```

See [SETUP.md](SETUP.md) for full Debian deployment instructions including systemd and kiosk mode.

---

## Tech stack

- **Backend** — Node.js, Express, SQLite (better-sqlite3)
- **Auth** — JWT + bcrypt
- **Frontend** — Vanilla HTML/CSS/JS (no build step)
- **Database** — SQLite, auto-migrated on startup
