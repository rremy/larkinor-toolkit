#!/usr/bin/env bash
#
# serve.sh — build the Larkinor userscript and serve it (plus the monster DB)
# over your LAN so ViolentMonkey can load it on desktop or mobile.
#
# Usage:
#   ./serve.sh            # build + serve on port 9912
#   PORT=8080 ./serve.sh  # custom port
#
# Then install the loader it prints into ViolentMonkey (one-time). The loader
# fetches the freshly-built main script on every page load, so after code
# changes you only need to re-run this script (no reinstall).
#
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-9912}"
DIST="dist"
MONSTERS_SRC="../lc-database/db/monsters.json"

# --- Detect a reachable LAN IP (falls back to localhost) ---------------------
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[ -z "$IP" ] && IP="127.0.0.1"
HOST="$IP:$PORT"

echo "==> Building main userscript..."
npm run build >/dev/null

# --- Stage monster DB next to the script ------------------------------------
if [ -f "$MONSTERS_SRC" ]; then
  cp "$MONSTERS_SRC" "$DIST/monsters.json"
  echo "==> Copied monster DB ($(wc -c < "$DIST/monsters.json" | tr -d ' ') bytes)"
else
  echo "WARNING: $MONSTERS_SRC not found — monster tooltips will be disabled." >&2
  echo "[]" > "$DIST/monsters.json"
fi

# --- Bake the real monsters URL into the built script -----------------------
# (main.ts ships with the YOUR_DOMAIN_HERE placeholder)
sed -i '' "s#https://YOUR_DOMAIN_HERE/monsters.json#http://$HOST/monsters.json#g" \
  "$DIST/larkinor-ui.user.js"

# --- Generate a ready-to-install loader pointing at this server -------------
cat > "$DIST/larkinor-loader.user.js" <<EOF
// ==UserScript==
// @name         Larkinor UI Loader (local)
// @namespace    https://lcenter.local/
// @version      1.0.0
// @description  Loads the locally-served Larkinor UI script
// @match        https://larkinor.hu/*
// @match        https://l2.larkinor.hu/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      $IP
// @connect      localhost
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';
  var SCRIPT_URL = 'http://$HOST/larkinor-ui.user.js';
  GM_xmlhttpRequest({
    method: 'GET',
    url: SCRIPT_URL + '?v=' + Date.now(),
    onload: function (r) { if (r.status === 200) eval(r.responseText); },
    onerror: function () { console.warn('[Larkinor UI Loader] failed to load ' + SCRIPT_URL); }
  });
})();
EOF

cat <<EOF

============================================================
  Larkinor UI — local server
============================================================
  Main script : http://$HOST/larkinor-ui.user.js
  Monster DB  : http://$HOST/monsters.json
  LOADER      : http://$HOST/larkinor-loader.user.js   <-- install this

  ONE-TIME SETUP (per device):
    1. Open the LOADER url above in a browser with ViolentMonkey.
       ViolentMonkey offers to install it. Confirm.
       (On mobile Firefox: same — open the URL, install.)
    2. Open the game (https://larkinor.hu). The UI loads automatically.

  AFTER CODE CHANGES: just re-run ./serve.sh — no reinstall needed.

  Notes:
    - The loader uses GM_xmlhttpRequest (@connect $IP), so http works from
      the https game page — no CORS/mixed-content issues.
    - Mobile: keep this Mac awake, phone on the same Wi-Fi. If it can't
      connect, allow incoming connections for python3 in macOS firewall.
    - Ctrl+C to stop the server.
============================================================

EOF

echo "==> Serving $DIST at http://$HOST  (Ctrl+C to stop)"
exec python3 -c "
from http.server import SimpleHTTPRequestHandler, HTTPServer
import os, sys
os.chdir('$DIST')
class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, fmt, *a):
        sys.stderr.write('  ' + (fmt % a) + '\n')
HTTPServer(('0.0.0.0', $PORT), H).serve_forever()
"
