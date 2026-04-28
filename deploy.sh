#!/bin/bash
# ============================================================
#  GigDashboard — Deploy Script (run from Mac)
#  Usage: bash deploy.sh <device-ip> [username]
#  Example: bash deploy.sh 192.168.86.50
#           bash deploy.sh 192.168.86.50 gigdash
# ============================================================

IP=${1:?Usage: bash deploy.sh <device-ip> [username]}
USER=${2:-gigdash}
PROJECT="/Users/cbaldwin/Documents/VS Code/GigDash"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       GigDashboard Deploy            ║"
echo "╚══════════════════════════════════════╝"
echo ""

echo "→ Building zip..."
cd "$(dirname "$PROJECT")"
zip -r gigdash.zip GigDash/ -q \
    --exclude "GigDash/.git/*" \
    --exclude "GigDash/node_modules/*" \
    --exclude "GigDash/gigdash.db" \
    --exclude "GigDash/*.zip"
echo "  Done."

echo "→ Transferring to $USER@$IP..."
scp "$(dirname "$PROJECT")/gigdash.zip" $USER@$IP:/tmp/
echo "  Done."

echo "→ Running setup on $IP..."
ssh -t $USER@$IP "su - root -c 'apt-get install -y -qq unzip && cd /tmp && unzip -o gigdash.zip && cd GigDash && bash setup.sh'"
echo ""
