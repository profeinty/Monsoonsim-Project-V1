// ==UserScript==
// @name         FF live (loads by itself)
// @namespace    https://profeinty.github.io/Secret-FF-Doomsday-Project/
// @version      1.0
// @description  Loads the FF reader and bot on the MonsoonSIM game tab every time it opens, so there is no bookmark to click.
// @match        https://*.monsoonsim.com/*/game_player.html*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://profeinty.github.io/Secret-FF-Doomsday-Project/ff-live.user.js
// @updateURL    https://profeinty.github.io/Secret-FF-Doomsday-Project/ff-live.user.js
// ==/UserScript==
(() => {
  if (window.__ff) return;   // already running (the bookmark was clicked first)
  const mode = location.pathname.split("/").filter(Boolean)[0] || "";
  window.__FF_MODE = /^1[0-9]i?$/i.test(mode) ? mode : "12i";   // the game's address names its mode: /12i/, /14/...
  const s = document.createElement("script");
  s.charset = "utf-8";
  s.src = "https://profeinty.github.io/Secret-FF-Doomsday-Project/reader.js?t=" + Date.now();   // always the newest reader
  (document.head || document.documentElement).appendChild(s);
})();
