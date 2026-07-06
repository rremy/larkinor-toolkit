// ==UserScript==
// @name         Larkinor UI Loader
// @namespace    https://lcenter.local/
// @version      1.0.0
// @description  Loads the Larkinor UI enhancement script from the remote server
// @author       lcenter
// @match        https://larkinor.hu/*
// @match        https://l2.larkinor.hu/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      YOUR_DOMAIN_HERE
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // Replace with your actual hosting URL before installing
  const SCRIPT_URL = 'https://YOUR_DOMAIN_HERE/larkinor-ui.user.js';

  GM_xmlhttpRequest({
    method: 'GET',
    url: SCRIPT_URL + '?v=' + Date.now(),
    onload: function (response) {
      if (response.status === 200) {
        // eslint-disable-next-line no-eval
        eval(response.responseText);
      } else {
        console.warn('[Larkinor UI Loader] Unexpected status:', response.status);
      }
    },
    onerror: function () {
      console.warn('[Larkinor UI Loader] Failed to load main script from', SCRIPT_URL);
    },
  });
})();
