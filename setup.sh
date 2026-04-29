#!/bin/bash
# ============================================================
#  GigDashboard SETUP — Debian 13
#  Run as root after transferring the project to the device
#  Usage: bash setup.sh
# ============================================================

set -e

GD_USER="gigdash"
GD_DIR="/opt/gigdash"
SERVICE_PORT="3000"
NEEDS_REBOOT=false

echo ""
echo "╔══════════════════════════════════════╗"
echo "║      GigDashboard SETUP v1.0         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 0. Fix clock before anything else ───────────────────────
echo "[0/8] Syncing system clock..."
hwclock --hctosys 2>/dev/null || true
apt-get -o Acquire::Check-Valid-Until=false update -qq
apt-get install -y -qq chrony
systemctl enable chrony
systemctl start chrony
chronyc makestep 2>/dev/null || true
sleep 3

# ── 1. System update ─────────────────────────────────────────
echo "[1/8] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Install dependencies ──────────────────────────────────
echo "[2/8] Installing dependencies..."
apt-get install -y -qq \
    xorg \
    openbox \
    chromium \
    curl \
    git \
    sudo \
    unclutter \
    unzip \
    fonts-dejavu \
    ca-certificates \
    gnupg

# Node.js 20 LTS via NodeSource
if ! command -v node &>/dev/null; then
    echo "  Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
echo "  Node $(node -v) ready."

# ── 3. Create gigdash user ───────────────────────────────────
echo "[3/8] Creating gigdash user..."
if ! id "$GD_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$GD_USER"
    usermod -aG video,audio,input "$GD_USER"
    NEEDS_REBOOT=true
fi
# Always write sudoers (covers fresh installs and updates)
printf '%s ALL=(ALL) NOPASSWD: /usr/sbin/reboot, /usr/sbin/shutdown, /usr/bin/systemctl restart gigdash\nDefaults:%s !requiretty\n' \
    "$GD_USER" "$GD_USER" > /etc/sudoers.d/gigdash
chmod 440 /etc/sudoers.d/gigdash

# ── 4. Auto-login on tty1 ────────────────────────────────────
echo "[4/8] Configuring auto-login..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $GD_USER --noclear %I \$TERM
EOF

# ── 5. Auto-start X on login ─────────────────────────────────
echo "[5/8] Configuring X auto-start..."
cat > /home/$GD_USER/.bash_profile << 'EOF'
# Auto-start X on tty1
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    exec startx
fi
EOF
chown $GD_USER:$GD_USER /home/$GD_USER/.bash_profile

# ── 6. Openbox autostart (kiosk) ─────────────────────────────
echo "[6/8] Configuring Openbox + Chromium kiosk..."
mkdir -p /home/$GD_USER/.config/openbox
cat > /home/$GD_USER/.config/openbox/autostart << EOF
# Hide cursor after 1s idle
unclutter -idle 1 -root &

# Disable screen blanking & DPMS
xset s off
xset -dpms
xset s noblank

# Keep display alive — reset screen saver every 4 minutes
while true; do xset s reset; sleep 240; done &

# Start the GigDashboard server
/usr/bin/node $GD_DIR/server.js &

# Wait for the server to be ready
sleep 3

# Reset Chromium exit state so the restore prompt never appears
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/g; s/"exit_type":"Killed"/"exit_type":"Normal"/g; s/"exited_cleanly":false/"exited_cleanly":true/g' \
    /home/$GD_USER/.config/chromium/Default/Preferences 2>/dev/null || true

# Launch Chromium in kiosk mode
chromium \\
    --no-first-run \\
    --disable-infobars \\
    --disable-session-crashed-bubble \\
    --disable-restore-session-state \\
    --disable-features=TranslateUI \\
    --remote-debugging-port=9222 \\
    --remote-allow-origins=http://localhost:9222 \\
    --start-fullscreen \\
    http://localhost:$SERVICE_PORT/tv &
EOF
chown -R $GD_USER:$GD_USER /home/$GD_USER/.config

# ── 7. Install app ───────────────────────────────────────────
echo "[7/8] Installing GigDashboard app..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Always copy from zip — reliable, works offline, preserves .env and DB
mkdir -p $GD_DIR
cp -r "$SCRIPT_DIR"/. $GD_DIR/

# Set up git for update-button support (clone to temp, move .git over)
if [ ! -d "$GD_DIR/.git" ]; then
    echo "  Setting up git for update support..."
    rm -rf /tmp/gd-setup
    echo "  Testing network..."
    curl -sf --max-time 10 https://github.com > /dev/null \
        && echo "  GitHub reachable." \
        || echo "  WARNING: GitHub not reachable (curl failed)"
    echo "  Cloning (no-checkout) from https://github.com/its-cb/GigDash.git ..."
    git clone --no-checkout https://github.com/its-cb/GigDash.git /tmp/gd-setup 2>&1
    GIT_EXIT=$?
    if [ $GIT_EXIT -eq 0 ]; then
        mv /tmp/gd-setup/.git $GD_DIR/.git
        rm -rf /tmp/gd-setup
        git -C $GD_DIR reset --hard HEAD -q 2>/dev/null || true
        echo "  Git ready — update button enabled."
    else
        echo "  Git clone failed (exit $GIT_EXIT) — update button unavailable."
        rm -rf /tmp/gd-setup
    fi
fi

chown -R $GD_USER:$GD_USER $GD_DIR

# Install npm dependencies
cd $GD_DIR
sudo -u $GD_USER npm install --omit=dev -q

# Generate a JWT secret and persist it
if [ ! -f $GD_DIR/.env ]; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "JWT_SECRET=$JWT_SECRET" > $GD_DIR/.env
    echo "PORT=$SERVICE_PORT"    >> $GD_DIR/.env
    chown $GD_USER:$GD_USER $GD_DIR/.env
    chmod 600 $GD_DIR/.env
fi

# Seed the database on first install
if [ ! -f $GD_DIR/gigdash.db ]; then
    echo ""
    echo "  ── First-time setup ─────────────────────────────────"
    echo -n "  Kid 1 name: "
    read KID1_NAME
    echo -n "  Kid 2 name: "
    read KID2_NAME
    KID1_NAME=${KID1_NAME:-Kid1}
    KID2_NAME=${KID2_NAME:-Kid2}
    echo "  Seeding database..."
    sudo -u $GD_USER KID1_NAME="$KID1_NAME" KID2_NAME="$KID2_NAME" node $GD_DIR/db/seed.js
fi

# ── 8. Systemd service ───────────────────────────────────────
echo "[8/8] Creating systemd service..."
cat > /etc/systemd/system/gigdash.service << EOF
[Unit]
Description=GigDashboard — Kids task & earnings tracker
After=network.target

[Service]
User=$GD_USER
WorkingDirectory=$GD_DIR
EnvironmentFile=$GD_DIR/.env
ExecStart=/usr/bin/node $GD_DIR/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable gigdash.service

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        SETUP COMPLETE ✓                  ║"
echo "╠══════════════════════════════════════════╣"
echo "║  TV Dashboard:  http://localhost:3000/tv  ║"
echo "║  Parent Panel:  http://<ip>:3000/parent   ║"
echo "║  Logins:  dad / parent123                 ║"
echo "║           mom / parent123                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""
if [ "$NEEDS_REBOOT" = "true" ]; then
    echo -n "Reboot required. Reboot now? [y/N] "
    read REPLY
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        reboot
    fi
else
    echo "No reboot needed — restarting service..."
    systemctl restart gigdash 2>/dev/null || true
fi
