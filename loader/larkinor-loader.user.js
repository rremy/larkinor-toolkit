// ==UserScript==
// @name         Larkinor Toolkit Loader
// @namespace    https://github.com/rremy/larkinor-toolkit
// @version      1.0.0
// @description  Fetches and runs the Larkinor Toolkit script from a remote host on every page load
// @author       rremy
// @match        https://larkinor.hu/*
// @match        https://l2.larkinor.hu/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      rremy.github.io
// @run-at       document-end
// ==/UserScript==

// This loader is a DEVELOPMENT convenience, not the normal way to install.
//
// Most people should install the built script directly — it carries @updateURL,
// so the userscript manager keeps it current on its own:
//   https://rremy.github.io/larkinor-toolkit/larkinor-ui.user.js
//
// The loader exists because it re-fetches the script on every page load, so a
// rebuild takes effect on the next refresh with no reinstall. That is what you
// want while iterating on a phone, where reinstalling is tedious. `./serve.sh`
// generates a variant of this file pointing at your LAN address.
//
// IMPORTANT: the loader `eval`s the main script, so the main script's GM_* calls
// run inside *this* file's grant sandbox. Every GM function the main script uses
// must be @grant-ed above, or it fails with a ReferenceError on boot.

(function () {
  'use strict';

  // Where the built main script is hosted. Change this (and @connect above, which
  // must name the same host) to load from your own server instead.
  const SCRIPT_URL = 'https://rremy.github.io/larkinor-toolkit/larkinor-ui.user.js';

  GM_xmlhttpRequest({
    method: 'GET',
    url: SCRIPT_URL + '?v=' + Date.now(),
    onload: function (response) {
      if (response.status === 200) {
        // eslint-disable-next-line no-eval
        eval(response.responseText);
      } else {
        console.warn('[Larkinor Toolkit Loader] Unexpected status:', response.status);
      }
    },
    onerror: function () {
      console.warn('[Larkinor Toolkit Loader] Failed to load main script from', SCRIPT_URL);
    },
  });
})();
