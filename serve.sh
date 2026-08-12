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
DB_SRC="static/db"
# The URL baked into the built bundle (see DATA_BASE_URL in the boot modules),
# rewritten below so a local run fetches data from this server instead.
PROD_DATA_URL="https://example.invalid/larkinor/static/db"

# --- Detect a reachable LAN IP (falls back to localhost) ---------------------
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[ -z "$IP" ] && IP="127.0.0.1"
HOST="$IP:$PORT"

echo "==> Building main userscript..."
npm run build >/dev/null

# --- Stage the game data next to the script ---------------------------------
# Served at the same relative path the production host uses, so the rewrite
# below is a pure origin swap.
if [ -d "$DB_SRC" ]; then
  mkdir -p "$DIST/static"
  cp -R "$DB_SRC" "$DIST/static/db"
  echo "==> Copied game DB ($(ls "$DIST/static/db" | wc -l | tr -d ' ') files)"
else
  echo "WARNING: $DB_SRC not found — the database overlay and monster links will not work." >&2
fi

# --- Point the built script at this server's copy of the data ---------------
# Without this the bundle fetches from the production host, which the generated
# loader does not @connect — ViolentMonkey would block it silently.
if grep -q "$PROD_DATA_URL" "$DIST/larkinor-ui.user.js"; then
  sed -i '' "s#$PROD_DATA_URL#http://$HOST/static/db#g" "$DIST/larkinor-ui.user.js"
  echo "==> Repointed data URL at http://$HOST/static/db"
else
  echo "WARNING: '$PROD_DATA_URL' not found in the built script — the data URL in" >&2
  echo "         the boot modules changed. Update PROD_DATA_URL in serve.sh." >&2
fi

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
  Game DB     : http://$HOST/static/db/monsters.json
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
