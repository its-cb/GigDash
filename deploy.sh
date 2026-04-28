#!/bin/bash
# ============================================================
#  GigDashboard — Deploy Script (run from Mac)
#  Usage: bash deploy.sh <device-ip> [username]
#  Example: bash deploy.sh 192.168.86.50
#           bash deploy.sh 192.168.86.50 gigdash
# ============================================================

IP=${1:?Usage: bash deploy.sh <device-ip> [username]}
USER=${2:-gigdash}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="$(basename "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       GigDashboard Deploy            ║"
echo "╚══════════════════════════════════════╝"
echo ""

echo "→ Building zip..."
cd "$(dirname "$SCRIPT_DIR")"
zip -r gigdash.zip "$PROJECT_NAME/" -q \
    --exclude "$PROJECT_NAME/.git/*" \
    --exclude "$PROJECT_NAME/node_modules/*" \
    --exclude "$PROJECT_NAME/gigdash.db" \
    --exclude "$PROJECT_NAME/*.zip"
echo "  Done."

echo "→ Transferring to $USER@$IP..."
scp "$(dirname "$SCRIPT_DIR")/gigdash.zip" $USER@$IP:/tmp/
echo "  Done."

echo "→ Running setup on $IP..."
ssh -t $USER@$IP "su - root -c 'apt-get install -y -qq unzip && cd /tmp && unzip -o gigdash.zip && cd GigDash && bash setup.sh'"
echo ""
