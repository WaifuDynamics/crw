/*!
 * Push-ups embed v1.2.0
 * Drop-in widget: <div data-pushups></div> + this script.
 * Docs: README.md in the embed package.
 */
(function () {
  "use strict";

  if (window.Pushups && window.Pushups.version) return; // loaded twice - keep the first

  var VERSION = "1.2.0";
  var MODES = { solo: true, "1v1": true, "2v2": true };

  // The server this script was loaded from is the default game server, so the
  // snippet needs no configuration when it is copied as-is.
  var script = document.currentScript;
  var DEFAULT_SERVER = script && script.src
    ? new URL(script.src).origin
    : "https://pompki.szybki-drop.pl";

  function attr(el, name) {
    var v = el.getAttribute("data-" + name);
    return v === null ? undefined : v;
  }

  function bool(v, fallback) {
    if (v === undefined || v === null || v === "") return fallback;
    return !(v === false || v === "false" || v === "0" || v === "no");
  }

  function mount(el, options) {
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) throw new Error("Pushups.mount: container element not found");
    if (el.__pushups) return el.__pushups;

    var o = options || {};
    var pick = function (key, dataName) {
      return o[key] !== undefined ? o[key] : attr(el, dataName || key);
    };

    var server = String(pick("server") || DEFAULT_SERVER).replace(/\/+$/, "");
    var serverOrigin = new URL(server, location.href).origin;
    var minHeight = parseInt(pick("height"), 10) || 520;
    var autoHeight = bool(pick("autoHeight", "auto-height"), true);

    var q = new URLSearchParams({ embed: "1" });
    var mode = pick("mode");
    if (mode && MODES[mode]) q.set("mode", mode);
    var exercise = pick("exercise");
    if (exercise === "pushup" || exercise === "squat") q.set("exercise", exercise);
    var name = pick("name");
    if (name) q.set("name", String(name).slice(0, 16));
    if (bool(pick("lockMode", "lock-mode"), false)) q.set("lock", "1");
    if (pick("model") === "lite") q.set("model", "lite");
    // Plays a bundled recording instead of using the camera - handy for checking
    // the integration without standing up to do push-ups.
    if (bool(pick("demo"), false)) q.set("video", "test.mp4");
    // Host palette: plain hex only, the page ignores anything else.
    ["bg", "panel", "line", "ink", "muted", "me", "op", "onme"].forEach(function (key) {
      var v = pick(key);
      if (v && /^#[0-9a-f]{6}$/i.test(v)) q.set(key, v);
    });
    if (pick("fonts")) q.set("fonts", String(pick("fonts")));
    if (bool(pick("brand"), true) === false) q.set("brand", "0");

    var iframe = document.createElement("iframe");
    iframe.src = server + "/?" + q.toString();
    iframe.title = "Push-up counter";
    // Without this the browser refuses the camera inside a cross-origin frame.
    iframe.allow = "camera; fullscreen";
    iframe.setAttribute("allowfullscreen", "");
    iframe.style.cssText = [
      "display:block",
      "width:100%",
      "border:0",
      "border-radius:16px",
      "background:#0e0f12",
      "height:" + minHeight + "px",
      "transition:height .2s ease",
    ].join(";");
    el.appendChild(iframe);

    function onMessage(e) {
      // Only trust messages from our own frame on the game server's origin.
      if (e.origin !== serverOrigin || e.source !== iframe.contentWindow) return;
      var d = e.data;
      if (!d || d.source !== "pushups" || typeof d.type !== "string") return;

      if (d.type === "resize" && autoHeight && d.height > 0) {
        iframe.style.height = Math.max(minHeight, Math.ceil(d.height)) + "px";
      }

      var detail = {};
      for (var k in d) if (k !== "source" && k !== "type") detail[k] = d[k];
      el.dispatchEvent(new CustomEvent("pushups:" + d.type, { detail: detail, bubbles: true }));
      if (typeof o.onEvent === "function") {
        try { o.onEvent(d.type, detail); } catch (err) { setTimeout(function () { throw err; }); }
      }
    }
    window.addEventListener("message", onMessage);

    var api = {
      element: el,
      iframe: iframe,
      destroy: function () {
        window.removeEventListener("message", onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        delete el.__pushups;
      },
    };
    el.__pushups = api;
    return api;
  }

  function scan(root) {
    var nodes = (root || document).querySelectorAll("[data-pushups]");
    var out = [];
    for (var i = 0; i < nodes.length; i++) out.push(mount(nodes[i]));
    return out;
  }

  window.Pushups = { version: VERSION, mount: mount, scan: scan };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scan(); });
  } else {
    scan();
  }
})();
