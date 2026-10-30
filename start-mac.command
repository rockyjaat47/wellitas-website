#!/bin/bash
# Double-click to run the Wellitas store on this Mac: http://localhost:3000 (store) and /admin.
cd "$(dirname "$0")/server" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then run this again."
  read -r -p "Press Enter to close"; exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  echo "Node.js $(node -v) is too old. Install Node 22.13 or newer from https://nodejs.org"
  read -r -p "Press Enter to close"; exit 1
fi
[ -d node_modules ] || npm install --omit=dev --no-fund --no-audit
# Without Razorpay keys in server/.env, online payments run in demo mode (no real money) for testing.
[ -f .env ] && grep -q '^RAZORPAY_KEY_ID=.\+' .env || export PAYMENTS_DEMO=1
( sleep 2; open "http://localhost:${PORT:-3000}" ) &
echo
echo "Store:  http://localhost:${PORT:-3000}"
echo "Admin:  http://localhost:${PORT:-3000}/admin   (first login is saved in server/data/FIRST-LOGIN.txt)"
echo "Close this window or press Ctrl+C to stop."
echo
node server.js
