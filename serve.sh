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
# --- Detect a reachable LAN IP (falls back to localhost) ---------------------
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[ -z "$IP" ] && IP="127.0.0.1"
HOST="$IP:$PORT"

# Build against this server as the public base URL, so the bundle's data URL,
# @connect host and @updateURL all point here instead of the deployed site (see
# vite.config.ts). No post-build patching of the output is needed.
echo "==> Building main userscript (base URL http://$HOST)..."
LC_PUBLIC_BASE_URL="http://$HOST" npm run build >/dev/null

# --- Stage the game data next to the script ---------------------------------
# Served at `static/db`, the same relative path every deployment uses, so the
# base URL above is the only thing that differs from a production build.
if [ -d "$DB_SRC" ]; then
  mkdir -p "$DIST/static"
  cp -R "$DB_SRC" "$DIST/static/db"
  echo "==> Copied game DB ($(ls "$DIST/static/db" | wc -l | tr -d ' ') files)"
else
  echo "WARNING: $DB_SRC not found — the database overlay and monster links will not work." >&2
fi

# --- Sanity-check that the build really points here --------------------------
# Cheap guard against a silent misconfiguration: if the bundle still names the
# deployed host, the userscript would fetch data the loader does not @connect and
# ViolentMonkey would block it with no visible error.
if grep -q "http://$HOST" "$DIST/larkinor-ui.user.js"; then
  echo "==> Data URL points at http://$HOST/static/db"
else
  echo "WARNING: the built script does not reference http://$HOST — LC_PUBLIC_BASE_URL" >&2
  echo "         did not reach the build. The data fetch will be blocked." >&2
fi

# --- Generate a ready-to-install loader pointing at this server -------------
cat > "$DIST/larkinor-loader.user.js" <<EOF
// ==UserScript==
// @name         Larkinor Toolkit Loader (local)
// @namespace    https://github.com/rremy/larkinor-toolkit
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
