# GigDashboard — Setup Guide

## Requirements

- Debian 13 (Trixie) or any modern Debian/Ubuntu-based distro
- Node.js 20+ (`sudo apt install nodejs npm`)
- A machine connected to the TV (can be a Raspberry Pi 4+)

---

## 1 — Install on your Linux box

```bash
# Install Node.js 20 LTS (if not already installed)
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Copy the project to /opt
sudo cp -r GigDash /opt/gigdash
cd /opt/gigdash

# Install dependencies
npm install

# Seed the database (creates kids, sample tasks, and parent logins)
npm run seed
```

---

## 2 — First-time configuration

Edit `server.js` or set environment variables before starting:

| Variable      | Default                        | What to change                    |
|---------------|--------------------------------|-----------------------------------|
| `PORT`        | `3000`                         | Optional — change if 3000 is used |
| `JWT_SECRET`  | `gigdash-change-me-in-production` | **Set to a long random string!** |

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3 — Run as a systemd service (auto-start on boot)

```bash
# Create a dedicated user
sudo useradd -r -s /bin/false gigdash
sudo chown -R gigdash:gigdash /opt/gigdash

# Install the service
sudo cp /opt/gigdash/gigdash.service /etc/systemd/system/
# Edit the JWT_SECRET line in the service file first!
sudo nano /etc/systemd/system/gigdash.service

sudo systemctl daemon-reload
sudo systemctl enable gigdash
sudo systemctl start gigdash

# Check it's running
sudo systemctl status gigdash
```

---

## 4 — TV Dashboard

Open a browser on the TV machine in kiosk mode:

```bash
# With Chromium (Raspberry Pi / Debian)
chromium-browser --kiosk --noerrdialogs --disable-infobars \
  --app=http://localhost:3000/tv
```

Or add this to `/etc/xdg/openbox/autostart` to launch automatically at login.

The dashboard polls every 15 seconds — no keyboard or mouse needed.

---

## 5 — Parent Dashboard (phone)

Find your Linux box's IP address:
```bash
hostname -I
```

Then open `http://<ip-address>:3000/parent` on your phone.

**Default logins** (change passwords after first login — see below):
- `dad` / `parent123`
- `mom` / `parent123`

### Change a password

```bash
node -e "
const bcrypt = require('bcryptjs');
const { initDatabase, getDb } = require('./db/database');
initDatabase();
const db = getDb();
const hash = bcrypt.hashSync('YOUR_NEW_PASSWORD', 10);
db.prepare(\"UPDATE parents SET password_hash = ? WHERE username = ?\").run(hash, 'dad');
console.log('Password updated');
"
```

---

## 6 — How it works day-to-day

1. **Kids** approach the TV and see their columns — daily tasks and piggy bank total
2. **You** open the parent panel on your phone
   - Tap **Daily Tasks** → tap a kid's initial to mark each expectation complete
   - Once all daily tasks are checked for a kid, their Gig Tasks unlock on the TV automatically
   - Tap **Gig Tasks** → tap a kid's initial when they complete a chore to add earnings
3. Daily task completions reset at midnight (they track by date)
4. **Earnings** tab shows each kid's piggy bank total and a **Cash Out** button when it's payday

---

## Access URLs

| URL | Purpose |
|-----|---------|
| `http://<ip>:3000/tv` | TV dashboard (full-screen, read-only) |
| `http://<ip>:3000/parent` | Parent panel (login required) |
| `http://<ip>:3000/api/dashboard` | Raw JSON for the TV view |

---

## Optional: port 80 with nginx

```bash
sudo apt install -y nginx

# /etc/nginx/sites-available/gigdash
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}

sudo ln -s /etc/nginx/sites-available/gigdash /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Then access via `http://<ip>/tv` and `http://<ip>/parent` (no port needed).
