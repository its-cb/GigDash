# GigDashboard

A household chore and earnings tracker for kids. Built for a TV-connected display with a mobile parent control panel.

![Docker](https://img.shields.io/badge/docker-itscb%2Fgigdash-blue?logo=docker)

## Features

- **TV Dashboard** — full-screen display, one column per kid, scales to any number of kids
- **Daily Expectations** — tasks that must be completed before gig tasks unlock
- **Gig Tasks** — paid chores with dollar values; first-come-first-serve between kids
  - Weekly (rolling 7 days), Bi-weekly (14 days), or Permanent types
- **Tracking Tasks** — two-step non-gating tasks (e.g. Feed the dogs — Morning / Evening)
- **Piggy Bank** — running earnings total per kid with cash-out support
- **Parent Dashboard** — mobile-friendly web app with JWT login
  - Daily task management, gig task management, tracking, earnings
  - **Settings tab** — rename kids, change colors, add/remove kids, change password, recovery code

---

## Running with Docker

> **Note:** Docker support is included but has not been end-to-end tested. If you run into issues please open a GitHub issue.

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

Default logins: `dad / parent123` and `mom / parent123` — change these in the Settings tab after first login.

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

**5. On subsequent updates**, pull and redeploy:
```bash
git pull && deploygigdash <device-ip> <username>
```

The database is preserved between deploys — only code files are updated.

See [SETUP.md](SETUP.md) for full details including systemd configuration, kiosk mode, and optional nginx setup.

---

## Managing kids

Kids are managed directly from the **Settings tab** in the parent dashboard — no command line needed. You can:

- Rename any kid
- Change their color (10 color options)
- Add new kids
- Remove a kid

The TV dashboard automatically adjusts its layout to however many kids are configured.

---

## Password recovery

If you get locked out, use a recovery code to reset your password:

1. Go to the parent login page and tap **Forgot password?**
2. Enter your username, recovery code, and a new password

To generate a recovery code while logged in, go to **Settings → Recovery Code → Generate**. Store the code somewhere safe — it's only shown once. You can regenerate a new one any time you're logged in.

---

## Tech stack

- **Backend** — Node.js, Express, SQLite (better-sqlite3)
- **Auth** — JWT + bcrypt
- **Frontend** — Vanilla HTML/CSS/JS (no build step)
- **Database** — SQLite, auto-migrated on startup
