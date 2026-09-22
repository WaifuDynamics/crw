// Client: camera (never shown raw) -> pose -> rep counter -> server sync.
import { FilesetResolver, PoseLandmarker } from "./vendor/vision_bundle.mjs";
import { EXERCISES, Landmarks, PushupCounter, keyVisibility } from "./counter.js";
import { t, getLanguage, setLanguage, applyTranslations, SUPPORTED_LANGUAGES } from "./translations.js";

const SYNC_MIN_MS = 250;
const SYNC_MAX_MS = 900;
const MIN_KEY_VISIBILITY = 0.4;

// Bones drawn on the preview. Arms are separate because the rep count is derived
// from them - they get the strong colour, the rest of the body is context.
const BONES_ARMS = [[11, 13], [13, 15], [12, 14], [14, 16]];
const BONES_LEGS = [[23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const isLegBone = ([a, b]) => BONES_LEGS.some(([x, y]) => x === a && y === b);
const BONES_BODY = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
];
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const MIN_DRAW_VIS = 0.35;

const $ = (id) => document.getElementById(id);
const views = {
  load: $("view-load"),
  mode: $("view-mode"),
  queue: $("view-queue"),
  countdown: $("view-countdown"),
  race: $("view-race"),
  solo: $("view-solo"),
  solodone: $("view-solodone"),
  result: $("view-result"),
};

const params = new URLSearchParams(location.search);
// ?video=file.mp4 replaces the camera with a recording, so the counter can be
// checked against known footage without doing any push-ups.
const TEST_VIDEO = params.get("video");
// full is more accurate: on the test clip full scored 14/14, lite 13/14.
const MODEL = params.get("model") === "lite" ? "lite" : "full";
/** Reads a file next to this page. Works on file:// where fetch() does not. */
function readLocal(path) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", new URL(path, location.href).href);
    xhr.responseType = "arraybuffer";
    // A local read reports status 0 on success.
    xhr.onload = () => (xhr.status === 0 || xhr.status === 200) && xhr.response
      ? resolve(xhr.response)
      : reject(new Error("could not read " + path));
    xhr.onerror = () => reject(new Error("could not read " + path));
    xhr.send();
  });
}

// Where matchmaking lives. Served by its own little server the counter talks to /api;
// shipped inside the CRW+ app it talks to the CRW+ API, which the app passes in.
const MATCH_API = (params.get("match") || "/api").replace(/\/+$/, "");

// --- embed mode (set by embed.js) ---
// Inside the CRW+ Android/iOS app the page runs in a WebView: there is no parent frame,
// messages go through window.ReactNativeWebView instead.
const NATIVE_HOST = Boolean(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);
const EMBED = params.get("embed") === "1" && (window.parent !== window || NATIVE_HOST);
const PRESET_MODE = ["solo", "1v1", "2v2"].includes(params.get("mode")) ? params.get("mode") : null;
const PRESET_NAME = (params.get("name") || "").slice(0, 16);
const LOCK_MODE = params.get("lock") === "1" && Boolean(PRESET_MODE);
const PRESET_EXERCISE = EXERCISES[params.get("exercise")] ? params.get("exercise") : null;

// --- theming from the host page ---
// A host app can hand us its own palette so the widget stops looking like a
// guest. Values are validated as plain hex, never written into CSS verbatim.
const THEME_VARS = {
  bg: "--bg", panel: "--panel", line: "--line", ink: "--ink",
  muted: "--muted", me: "--me", op: "--op", onme: "--on-me", panel2: "--panel2",
};
const HEX = /^#[0-9a-f]{6}$/i;
// Only families we serve ourselves or trust; anything else is ignored.
const FONT_SETS = {
  crw: {
    href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;600;700&display=swap",
    body: "Inter, ui-sans-serif, system-ui, sans-serif",
    display: "\"Barlow Condensed\", Inter, ui-sans-serif, system-ui, sans-serif",
  },
};

function applyTheme() {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    const value = params.get(key);
    if (value && HEX.test(value)) root.style.setProperty(cssVar, value);
  }
  // A host with its own title bar would otherwise show the name twice.
  if (params.get("brand") === "0") {
    const h = document.getElementById("brand");
    if (h) h.hidden = true;
  }
  const set = FONT_SETS[params.get("fonts")];
  if (set) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = set.href;
    document.head.appendChild(link);
    root.style.setProperty("--font-body", set.body);
    root.style.setProperty("--font-display", set.display);
  }
}
applyTheme();
if (EMBED) document.documentElement.classList.add("embed");
// skin=crw: the CRW+ look (layout and type), on top of the colours from the theme.
if (params.get("skin") === "crw") document.documentElement.classList.add("skin-crw");

// --- sounds ---
// Short synthesized tones, no audio files. Soft by design: a quiet ping per rep, ticks
// for the idle countdown and a low two-note "stop".
const Sound = (() => {
  let ctx = null;
  let on = true;
  try { on = localStorage.getItem("pushups-sound") !== "off"; } catch {}
  const audio = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };
  // Browsers only start audio after a touch or click; unlock on the first one.
  const unlock = () => { audio(); };
  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });

  function tone(freq, start, length, gain, type = "sine") {
    const a = audio();
    if (!a || !on) return;
    const t0 = a.currentTime + start;
    const osc = a.createOscillator();
    const amp = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(amp).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.05);
  }

  const api = {
    get on() { return on; },
    set(value) {
      on = Boolean(value);
      try { localStorage.setItem("pushups-sound", on ? "on" : "off"); } catch {}
      for (const b of document.querySelectorAll(".sound-toggle")) {
        b.setAttribute("aria-pressed", String(on));
        b.setAttribute("aria-label", on ? t("sound.on") : t("sound.off"));
        b.innerHTML = on ? "&#128266;" : "&#128263;";
      }
      if (on) api.rep();
    },
    rep() { tone(1318.5, 0, 0.32, 0.09); tone(2637, 0, 0.12, 0.025); },
    tick(n) { tone(n <= 2 ? 784 : 659.3, 0, 0.16, 0.12, "triangle"); },
    stop() { tone(523.3, 0, 0.22, 0.14, "triangle"); tone(392, 0.2, 0.42, 0.14, "triangle"); },
  };
  return api;
})();
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".sound-toggle");
  if (b) Sound.set(!Sound.on);
});
queueMicrotask(() => Sound.set(Sound.on));

// Tell the embedding page what is happening. The payload is only game state
// (mode, counts, names) - never video - so a wildcard target origin is fine.
function emit(type, data) {
  if (!EMBED) return;
  const msg = Object.assign({ source: "pushups", type }, data || {});
  try {
    if (NATIVE_HOST) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else window.parent.postMessage(msg, "*");
  } catch { /* parent went away */ }
}

function cameraAllowed() {
  const pp = document.permissionsPolicy || document.featurePolicy;
  try { return pp ? pp.allowsFeature("camera") : null; } catch { return null; }
}

let landmarker = null;
let exercise = PRESET_EXERCISE || storedExercise() || "pushup";
let counter = makeCounter();
let playerId = null;
let server = null;        // last state snapshot from the server
let mode = null;          // "solo" | "1v1" | "2v2"
let racing = false;       // are reps counting towards a result
let lastCountSeen = 0;
let lostSince = null;
let flash = 0;            // frames of highlight after a counted rep
let inFlight = false;     // a tunnel round-trip can outlast the polling interval
let seq = 0;              // request number - an older reply must not undo a newer one
let seenSeq = 0;
let syncMs = SYNC_MIN_MS;
let stateV = -1;          // last state version seen - drives the long poll
let pollAbort = null;     // lets a finished rep cut a waiting poll short
let soloStart = 0;
let soloBest = 0;
let soloSetStart = 0;
let lastResultId = null;

function storedExercise() {
  try {
    const v = localStorage.getItem("pushups-exercise");
    return EXERCISES[v] ? v : null;
  } catch { return null; }
}

function makeCounter() {
  const ex = EXERCISES[exercise];
  return new PushupCounter({ upThreshold: ex.up, downThreshold: ex.down });
}

function setExercise(id) {
  if (!EXERCISES[id]) return;
  exercise = id;
  counter = makeCounter();
  window.__counter = counter;
  lastCountSeen = 0;
  for (const b of document.querySelectorAll(".ex")) {
    b.setAttribute("aria-pressed", String(b.dataset.exercise === id));
  }
  $("exercise-hint").textContent = t(`exercises.${id}Hint`);
  // The loading screen is the first thing an embedding page shows, so it must
  // not say "Push-ups" while the host asked for squats.
  const brand = $("brand");
  if (brand) brand.innerHTML = `${escapeHtml(t(`exercises.${id}`))}<span class="dot">.</span>`;
  document.title = t("appTitle", { exercise: t(`exercises.${id}`) });
  try { localStorage.setItem("pushups-exercise", id); } catch {}
}

const lostText = () => (exercise === "squat" ? t("cam.cantSeeLegs") : t("cam.cantSee"));
const exLabel = () => t(`exercises.${exercise}`);

// In the CRW+ skin the camera is the stage: while you queue, count down and move it
// fills the screen and the counters float on top. The plain page keeps the small box.
const STAGE = document.documentElement.classList.contains("skin-crw");

function show(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  // Bigger while waiting - that is when you frame yourself. Smaller while racing
  // so it does not crowd the counters.
  const box = $("cam-box");
  box.hidden = !(landmarker && ["queue", "countdown", "race", "solo"].includes(name));
  box.classList.toggle("racing", name === "race" || name === "solo");
  document.documentElement.classList.toggle("stage", STAGE && !box.hidden);
  document.documentElement.dataset.view = name;
  if (!box.hidden) sizePreview();
}

// The canvas matches the box in device pixels, so the stage stays sharp at any size.
function sizePreview() {
  const box = $("cam-box"), cv = $("preview");
  const r = box.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (w > 0 && h > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
}
window.addEventListener("resize", () => { if (!$("cam-box").hidden) sizePreview(); });

// --- camera + model ---

async function initCamera() {
  const status = $("load-status");
  try {
    const cam = $("cam");
    if (TEST_VIDEO) {
      status.textContent = t("errors.testMode", { video: TEST_VIDEO });
      cam.src = TEST_VIDEO;
      cam.loop = true;
      // Not awaited: play() never settles in a background tab, and the detection
      // loop already waits for readyState. Blocking here would stall the model.
      cam.play().catch(() => {});
    } else {
      status.textContent = t("cam.waiting");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      cam.srcObject = stream;
      cam.play().catch(() => {});
    }

    status.textContent = t("cam.loadingModel");
    const fileset = await FilesetResolver.forVisionTasks("./vendor/wasm");
    const modelPath = `./vendor/pose_landmarker_${MODEL}.task`;
    // Shipped inside the CRW+ app the page is a local file, and a browser will not fetch()
    // a file:// address - which is how MediaPipe loads its WebAssembly and its model. A
    // plain XMLHttpRequest may read local files, so both are read that way and handed over
    // from memory: the WebAssembly as a blob: address, the model as its bytes.
    const local = location.protocol === "file:";
    if (local) fileset.wasmBinaryPath = URL.createObjectURL(
      new Blob([await readLocal(fileset.wasmBinaryPath)], { type: "application/wasm" }));
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        ...(local
          ? { modelAssetBuffer: new Uint8Array(await readLocal(modelPath)) }
          : { modelAssetPath: modelPath }),
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });

    window.__counter = counter;   // handle for tests
    requestAnimationFrame(loop);
    emit("ready", { cameraAllowed: cameraAllowed(), mode: PRESET_MODE, exercise });
    if (PRESET_MODE) selectMode(PRESET_MODE);
    else show("mode");
  } catch (e) {
    status.className = "status err";
    status.textContent = describeError(e);
    emit("error", { code: (e && e.name) || "Error", message: status.textContent,
                    cameraAllowed: cameraAllowed() });
    status.insertAdjacentHTML("afterend",
      `<button class="ghost" onclick="location.reload()">${escapeHtml(t("errors.tryAgain"))}</button>`);
  }
}

function describeError(e) {
  const n = e && e.name;
  if (EMBED && cameraAllowed() === false) {
    return t("errors.iframeCamera");
  }
  if (n === "NotAllowedError") return t("errors.notAllowed");
  if (n === "NotFoundError") return t("errors.notFound");
  if (n === "NotReadableError") return t("errors.notReadable");
  if (location.protocol === "http:" && location.hostname !== "localhost") {
    return t("errors.plainHttp");
  }
  return t("errors.startFailed", { message: (e && e.message ? e.message : e) });
}

// --- detection loop ---

let lastVideoTime = -1;
let nextDetectAt = 0;
// Pose detection is synchronous. On a slow phone it can take most of every frame,
// which starves timers and network callbacks - the match sync then stalls and the
// server drops the player. After each detection we leave the thread free for half
// as long as the detection took, capping detection at about two thirds of the time.
const DETECT_REST = 0.5;

function loop() {
  const cam = $("cam");
  if (landmarker && cam.readyState >= 2 && cam.currentTime !== lastVideoTime &&
      performance.now() >= nextDetectAt) {
    lastVideoTime = cam.currentTime;
    const now = performance.now();
    const res = landmarker.detectForVideo(cam, now);
    const took = performance.now() - now;
    nextDetectAt = performance.now() + took * DETECT_REST;
    const t = now / 1000;

    let angle = null;
    let straight = null;
    let lm = null;
    if (res.landmarks && res.landmarks.length) {
      lm = new Landmarks(res.landmarks[0], cam.videoWidth, cam.videoHeight);
      const ex = EXERCISES[exercise];
      if (keyVisibility(lm, exercise) >= ex.minVisibility) {
        angle = ex.joint === "knee" ? lm.kneeAngle(ex.minVisibility) : lm.elbowAngle();
        straight = ex.formCheck ? lm.straightness() : null;
      }
    }

    if (angle === null) {
      counter.rawAngle = null;
      if (lostSince === null) lostSince = t;
    } else {
      lostSince = null;
      counter.update(angle, t, straight);
    }

    if (!$("cam-box").hidden) drawPreview(lm, flash > 0);
    if (flash > 0) flash -= 1;
    paintLive(t);
  }
  requestAnimationFrame(loop);
}

function drawPreview(lm, hit) {
  const cam = $("cam");
  const cv = $("preview");
  const vw = cam.videoWidth, vh = cam.videoHeight;
  if (!vw || !vh) return;
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const S = Math.min(W, H); // stroke and dot sizes follow the shorter side

  // Cover the canvas with the middle of the camera frame, whatever its shape.
  const scale = Math.max(W / vw, H / vh);
  const cw = W / scale, ch = H / scale;
  const sx = (vw - cw) / 2, sy = (vh - ch) / 2;

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(W, 0);
  ctx.scale(-1, 1);   // mirror, so moving left moves left on screen
  ctx.drawImage(cam, sx, sy, cw, ch, 0, 0, W, H);

  if (lm) {
    // landmarks are normalised to the whole frame, so map them onto the crop
    const P = (i) => {
      const p = lm.raw[i];
      return [((p.x * vw) - sx) / cw * W, ((p.y * vh) - sy) / ch * H];
    };
    const vis = (i) => lm.vis(i);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 6;

    // The joints the count comes from get the strong colour: arms for push-ups,
    // legs for squats. Everything else is drawn as context.
    const squat = exercise === "squat";
    const focus = squat ? BONES_LEGS : BONES_ARMS;
    const context = squat ? BONES_BODY.filter((b) => !isLegBone(b)).concat(BONES_ARMS) : BONES_BODY;
    const focusJoints = squat ? [25, 26, 27, 28] : [13, 14, 15, 16];

    ctx.strokeStyle = "rgba(233,238,246,.72)";
    ctx.lineWidth = Math.max(2, S * 0.011);
    for (const [a, b] of context) {
      if (Math.min(vis(a), vis(b)) < MIN_DRAW_VIS) continue;
      const p = P(a), q = P(b);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }

    ctx.strokeStyle = hit ? "#9dffc6" : "#46d67e";
    ctx.lineWidth = Math.max(3, S * 0.016);
    for (const [a, b] of focus) {
      if (Math.min(vis(a), vis(b)) < MIN_DRAW_VIS) continue;
      const p = P(a), q = P(b);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }

    ctx.shadowBlur = 0;
    for (const i of JOINTS) {
      if (vis(i) < MIN_DRAW_VIS) continue;
      const [x, y] = P(i);
      const arm = focusJoints.includes(i);
      ctx.beginPath();
      ctx.arc(x, y, arm ? S * 0.017 : S * 0.012, 0, Math.PI * 2);
      ctx.fillStyle = arm ? "#46d67e" : "rgba(233,238,246,.9)";
      ctx.fill();
    }
  }
  ctx.restore();
}

function stateWord() {
  return counter.state === "down" ? "down" : counter.state === "up" ? "up" : "—";
}

function repFlash(countEl) {
  flash = 8;
  const box = $("cam-box");
  box.classList.add("hit");
  setTimeout(() => box.classList.remove("hit"), 260);
  countEl.classList.remove("bump");
  void countEl.offsetWidth;
  countEl.classList.add("bump");
}

function paintLive(t) {
  const lost = lostSince !== null && t - lostSince > 0.4;

  const tag = $("cam-tag");
  tag.classList.toggle("lost", lost);
  tag.classList.toggle("ok", !lost);
  if (!views.race.hidden || !views.solo.hidden) {
    tag.textContent = lost ? lostText() : stateWord();
  } else {
    tag.textContent = lost ? lostText() : "got you — ready when you are";
  }

  if (!views.solo.hidden) return paintSolo(t, lost);
  if (views.race.hidden) return;

  const p = counter.progress;
  const fill = $("depth-fill");
  fill.style.width = (p * 100).toFixed(0) + "%";
  fill.classList.toggle("deep", p > 0.9);
  $("depth-state").textContent = stateWord();

  const sig = $("race-signal");
  sig.classList.toggle("lost", lost);
  sig.textContent = lost ? lostText() : "got you";

  if (counter.count !== lastCountSeen) {
    lastCountSeen = counter.count;
    repFlash($("me-count"));
    Sound.rep();
    paintTeams();
    pushCountNow();
    emit("rep", { mode, exercise, count: counter.count });
  }
}

// --- solo ---

function paintSolo(t, lost) {
  const p = counter.progress;
  const fill = $("solo-depth");
  fill.style.width = (p * 100).toFixed(0) + "%";
  fill.classList.toggle("deep", p > 0.9);
  $("solo-state").textContent = stateWord();

  const sig = $("solo-signal");
  sig.classList.toggle("lost", lost);
  sig.textContent = lost ? lostText() : "got you";

  if (counter.count !== lastCountSeen) {
    // A pause longer than 5 s ends a set - that is what "best set" measures.
    const n = counter.reps.length;
    const gap = n > 1 ? counter.reps[n - 1].tEnd - counter.reps[n - 2].tEnd : 0;
    if (gap > 5) soloSetStart = counter.count - 1;
    soloBest = Math.max(soloBest, counter.count - soloSetStart);

    lastCountSeen = counter.count;
    soloLastRep = Date.now();
    $("solo-count").textContent = counter.count;
    repFlash($("solo-count"));
    Sound.rep();
    emit("rep", { mode: "solo", exercise, count: counter.count });
    $("solo-best").textContent = soloBest || "—";
  }

  const secs = Math.max(0, Math.floor((Date.now() - soloStart) / 1000));
  $("solo-time").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  $("solo-pace").textContent = secs > 5 && counter.count
    ? (counter.count / (secs / 60)).toFixed(1) : "—";
}

// --- solo auto-stop ---
// After the first rep, IDLE_GRACE_MS without a new rep starts a 5-second countdown with
// ticks; a rep cancels it, reaching zero finishes the session.
const IDLE_GRACE_MS = 4000;
const IDLE_COUNT = 5;
let soloLastRep = 0;
let idleShown = -1;
let soloStopped = false;

setInterval(() => {
  const el = $("idle");
  const active = mode === "solo" && !views.solo.hidden && counter.count > 0 && soloLastRep > 0;
  const quiet = active ? Date.now() - soloLastRep - IDLE_GRACE_MS : -1;
  if (quiet < 0) {
    if (idleShown !== -1) { el.hidden = true; idleShown = -1; }
    return;
  }
  const left = IDLE_COUNT - Math.floor(quiet / 1000);
  if (left <= 0) {
    el.hidden = true;
    idleShown = -1;
    Sound.stop();
    soloStopped = true;
    finishSolo();
    return;
  }
  if (left !== idleShown) {
    idleShown = left;
    el.hidden = false;
    $("idle-n").textContent = left;
    $("idle-n").classList.remove("bump");
    void $("idle-n").offsetWidth;
    $("idle-n").classList.add("bump");
    Sound.tick(left);
  }
}, 100);

function startSolo() {
  mode = "solo";
  soloLastRep = 0;
  soloStopped = false;
  idleShown = -1;
  $("idle").hidden = true;
  counter.reset();
  lastCountSeen = 0;
  soloStart = Date.now();
  soloBest = 0;
  soloSetStart = 0;
  $("solo-count").textContent = "0";
  $("solo-best").textContent = "—";
  $("solo-pace").textContent = "—";
  $("solo-title").textContent = t("solo.title", { exercise: exLabel() });
  show("solo");
}

// --- solo summary and records ---
// Records live in this browser. A host app (CRW+) can answer a finished session with the
// signed-in account's records, which then replace the local ones on screen.

const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
const recordsKey = () => `pushups-solo-${exercise}`;

function localRecords() {
  try {
    const r = JSON.parse(localStorage.getItem(recordsKey()) || "null");
    if (r && Number.isFinite(r.reps)) return r;
  } catch {}
  return { reps: 0, bestSet: 0, sessions: 0 };
}

let lastSession = null;

function paintRecords(r, note) {
  $("sd-life").textContent = r.reps ? r.reps : "—";
  $("sd-life-best").textContent = r.bestSet ? r.bestSet : "—";
  $("sd-sessions").textContent = r.sessions ? r.sessions : "—";
  $("sd-saved").textContent = note;
}

function finishSolo() {
  const reps = counter.count;
  const seconds = Math.max(0, Math.round((Date.now() - soloStart) / 1000));
  const bestSet = Math.min(reps, soloBest);
  const before = localRecords();
  const session = {
    sessionId: `solo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    exercise, reps, bestSet, seconds,
  };
  lastSession = session;

  $("sd-title").textContent = t("soloDone.title", { exercise: exLabel() });
  $("sd-stopped").hidden = !soloStopped;
  soloStopped = false;
  soloLastRep = 0;
  $("idle").hidden = true;
  $("sd-reps").textContent = reps;
  $("sd-best").textContent = bestSet || "—";
  $("sd-time").textContent = fmtTime(seconds);
  $("sd-pace").textContent = seconds > 5 && reps ? (reps / (seconds / 60)).toFixed(1) : "—";
  $("sd-pb-flag").hidden = !(bestSet > 0 && bestSet > before.bestSet && before.sessions > 0);

  if (reps > 0) {
    const after = {
      reps: before.reps + reps,
      bestSet: Math.max(before.bestSet, bestSet),
      sessions: before.sessions + 1,
    };
    try { localStorage.setItem(recordsKey(), JSON.stringify(after)); } catch {}
    paintRecords(after, EMBED ? t("soloDone.saving") : t("soloDone.savedLocal"));
    emit("result", Object.assign({ mode: "solo" }, session));
  } else {
    paintRecords(before, t("soloDone.noRepsNote"));
  }
  mode = null;
  show("solodone");
}

// The host's answer to a solo "result": the account's records after saving the session.
function onHostRecords(d) {
  if (!d || d.source !== "crw" || d.type !== "records" || !lastSession) return;
  if (d.sessionId !== lastSession.sessionId || views.solodone.hidden) return;
  if (!d.saved) {
    $("sd-saved").textContent = d.message || t("soloDone.savedLocal");
    return;
  }
  const r = d.records || {};
  const records = {
    reps: Number(r.reps) || 0,
    bestSet: Number(r.bestSet) || 0,
    sessions: Number(r.sessions) || 0,
  };
  const previousBest = Number(d.previousBestSet);
  if (Number.isFinite(previousBest))
    $("sd-pb-flag").hidden = !(lastSession.bestSet > previousBest && records.sessions > 1);
  paintRecords(records, t("soloDone.savedAccount"));
}
window.addEventListener("message", (e) => {
  if (!EMBED || e.source !== window.parent) return;
  onHostRecords(e.data);
});
// The native app calls this with injected JavaScript (it has no postMessage into the page).
if (NATIVE_HOST) window.CRWHost = { records: onHostRecords };

// --- server sync ---

// Closing the page tells the server straight away, so this player stops being counted as
// online - and stops being matchable - instead of lingering for the timeout. A beacon is
// the one request a closing page is still allowed to finish.
window.addEventListener("pagehide", () => {
  if (!playerId) return;
  try {
    navigator.sendBeacon(`${MATCH_API}/sync`, JSON.stringify({ playerId, action: "quit" }));
  } catch {}
});

async function sync(action, wait = false) {
  if (inFlight && !action) return;
  inFlight = true;
  const mySeq = ++seq;
  const t0 = performance.now();
  const ac = new AbortController();
  if (wait) pollAbort = ac;
  try {
    const r = await fetch(`${MATCH_API}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        playerId,
        name: $("name").value.trim() || undefined,
        count: racing ? counter.count : 0,
        action: action || null,
        mode,
        exercise,
        wait,
        since: wait ? stateV : -1,
      }),
    });
    if (!r.ok) throw new Error("server: " + r.status);
    const data = await r.json();

    // replies can arrive out of order - an older one must not roll the state back
    if (mySeq < seenSeq) return;
    seenSeq = mySeq;

    server = data;
    playerId = server.playerId;
    stateV = data.v ?? -1;
    // The server hands out a distinct name when the field is left empty; show it
    // so you know what the other side sees you as.
    if (!$("name").value.trim() && server.me.name) $("name").placeholder = server.me.name;
    window.__server = server;

    // Only meaningful for plain polls - a long poll spends most of its time
    // waiting on purpose, so its duration says nothing about the link.
    if (!wait) {
      const rtt = performance.now() - t0;
      syncMs = Math.min(SYNC_MAX_MS, Math.max(SYNC_MIN_MS, Math.round(rtt * 1.6)));
    }

    render();
  } finally {
    inFlight = false;
    if (pollAbort === ac) pollAbort = null;
  }
}

// A finished rep should reach the opponent immediately, so cut the waiting poll
// short and let the loop fire a fresh request carrying the new count.
function pushCountNow() {
  if (pollAbort) pollAbort.abort();
}

let queueing = false;
function enterQueue() {
  // enterQueue is called from render(), and render() from sync() - without this
  // guard it could spin if the server kept reporting "idle".
  if (queueing) return;
  queueing = true;
  sync("queue").catch(showSyncError).finally(() => {
    setTimeout(() => { queueing = false; }, 1000);
  });
}

function render() {
  if (!server || mode === "solo" || !mode) return;
  const m = server.match;

  if (server.status === "queued") {
    show("queue");
    $("queue-title").textContent = server.mode === "2v2"
      ? t("queue.findingThreeMore", { exercise: exLabel() })
      : t("queue.findingOpponent", { exercise: exLabel() });
    $("queue-info").textContent = server.mode === "2v2"
      ? t("queue.playersReady", { ready: server.queueSize, needed: server.needed })
      : t("queue.waitingOneMore", { online: server.online });
    return;
  }
  if (!m) {
    // Idle without a match while we are still in an online mode means the server
    // dropped us (e.g. a long stall). Re-queue instead of hanging on this screen.
    if (server.status === "idle") {
      racing = false;
      enterQueue();
    }
    return;
  }

  if (m.state === "countdown") {
    show("countdown");
    racing = false;
    $("cd-me").textContent = teamLabel(server.teams[0], true);
    $("cd-op").textContent = teamLabel(server.teams[1], false);
    const s = Math.ceil(m.startsIn);
    const el = $("countdown");
    el.textContent = s > 0 ? String(s) : t("countdown.go");
    el.classList.toggle("go", s <= 0);
    return;
  }

  if (m.state === "running") {
    if (!racing) {
      // race starts - drop anything counted before the signal
      counter.reset();
      lastCountSeen = 0;
      racing = true;
      emit("matchstart", {
        mode: m.mode,
        exercise: m.exercise,
        target: m.target,
        you: server.me.name,
        teams: server.teams.map((t) => t.players.map((p) => p.name)),
      });
    }
    show("race");
    const asTeam = m.mode === "2v2" ? t("race.asTeam") : "";
    $("race-target").textContent =
      t("race.targetMsg", {
        mode: m.mode,
        exercise: exLabel().toLowerCase(),
        target: m.target,
      }) + asTeam;
    paintTeams();
    return;
  }

  if (m.state === "done") {
    racing = false;
    show("result");
    const won = m.winner === "me";
    const badge = $("result-badge");
    badge.textContent = won ? t("result.youWin") : t("result.youLose");
    badge.className = "badge " + (won ? "win" : "lose");
    $("result-score").textContent = `${server.teams[0].score} : ${server.teams[1].score}`;
    if (lastResultId !== m.id) {
      lastResultId = m.id;
      emit("result", {
        matchId: m.id,
        reps: counter.count,
        mode: m.mode,
        exercise: m.exercise,
        won,
        reason: m.reason,
        score: [server.teams[0].score, server.teams[1].score],
        opponents: server.teams[1].players.map((p) => p.name),
      });
    }
    const against = teamLabel(server.teams[1], false);
    $("result-reason").textContent = m.reason === "walkover"
      ? t("result.droppedOut", { against })
      : won
        ? t("result.youBeat", { against, target: m.target })
        : t("result.beatenBy", { against, target: m.target });
  }
}

function teamLabel(team, isMine) {
  if (!team || !team.players.length) return isMine ? t("race.you") : t("race.opponent");
  if (team.players.length === 1) return isMine ? t("race.you") : team.players[0].name;
  return team.players.map((p) => (p.you ? t("race.you") : p.name)).join(" + ");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function roster(el, team) {
  if (!team || team.players.length < 2) { el.innerHTML = ""; return; }
  el.innerHTML = team.players
    .map((p) => {
      const cls = [p.you ? "you" : "", p.gone ? "gone" : ""].filter(Boolean).join(" ");
      const label = escapeHtml(p.you ? t("race.you") : p.name) + (p.gone ? ` ${t("race.left")}` : "");
      return `<span${cls ? ` class="${cls}"` : ""}>${label} ${p.count}</span>`;
    })
    .join("");
}

function paintTeams() {
  if (!server || !server.teams || !server.match) return;
  const target = server.match.target || 20;
  const mine = server.teams[0];
  const theirs = server.teams[1];

  // Our own count is ahead of the server by up to one polling interval, so use
  // the local value for our own contribution - the bar must not lag the body.
  const myAtServer = mine.players.find((p) => p.you);
  const myLive = racing
    ? mine.score - (myAtServer ? myAtServer.count : 0) + counter.count
    : mine.score;

  $("me-name").textContent = teamLabel(mine, true);
  $("op-name").textContent = teamLabel(theirs, false);
  $("me-count").textContent = myLive;
  $("op-count").textContent = theirs.score;
  $("me-fill").style.width = Math.min(100, (myLive / target) * 100) + "%";
  $("op-fill").style.width = Math.min(100, (theirs.score / target) * 100) + "%";
  roster($("me-roster"), mine);
  roster($("op-roster"), theirs);
}

function showSyncError(e) {
  const s = $("load-status");
  s.className = "status err";
  s.textContent = t("errors.serverNoConn", { message: e.message });
}

// --- controls ---

function selectMode(picked) {
  try {
    localStorage.setItem("pushups-name", $("name").value.trim());
    localStorage.setItem("pushups-mode", picked);
  } catch { /* storage can be blocked inside third-party frames */ }
  emit("mode", { mode: picked, exercise });
  if (picked === "solo") { startSolo(); return; }
  mode = picked;
  racing = false;
  enterQueue();
}

for (const b of document.querySelectorAll(".mode")) {
  b.addEventListener("click", () => selectMode(b.dataset.mode));
}

for (const b of document.querySelectorAll(".ex")) {
  b.addEventListener("click", () => setExercise(b.dataset.exercise));
}
// A host that fixed the exercise has decided for the visitor.
if (PRESET_EXERCISE) $("exercise-pick").hidden = true;

// A host that locked the mode has no mode picker to go back to.
if (LOCK_MODE) {
  for (const id of ["btn-leave-queue", "btn-modes", "btn-solo-back", "btn-solo-done-back"]) $(id).hidden = true;
}

const toModes = () => {
  const wasOnline = mode && mode !== "solo";
  mode = null;
  racing = false;
  show("mode");
  if (wasOnline) sync("leave").catch(() => {});
};

$("btn-leave-queue").addEventListener("click", toModes);
$("btn-modes").addEventListener("click", toModes);
$("btn-solo-back").addEventListener("click", () => { mode = null; show("mode"); });
$("btn-solo-reset").addEventListener("click", startSolo);
$("btn-solo-finish").addEventListener("click", finishSolo);
$("btn-solo-again").addEventListener("click", startSolo);
$("btn-solo-done-back").addEventListener("click", () => { mode = null; show("mode"); });
$("btn-quit").addEventListener("click", () => sync("leave").then(enterQueue).catch(showSyncError));
$("btn-again").addEventListener("click", () => sync("leave").then(enterQueue).catch(showSyncError));

$("name").addEventListener("input", () => {
  try { localStorage.setItem("pushups-name", $("name").value.trim()); } catch {}
});
try { $("name").value = localStorage.getItem("pushups-name") || ""; } catch {}
if (PRESET_NAME) $("name").value = PRESET_NAME;

// The host page sizes the iframe from this, so the widget never shows scrollbars.
if (EMBED && "ResizeObserver" in window) {
  let lastH = 0;
  new ResizeObserver(() => {
    const h = Math.ceil(document.querySelector("main").getBoundingClientRect().height);
    if (h !== lastH) { lastH = h; emit("resize", { height: h }); }
  }).observe(document.querySelector("main"));
}

// the interval is adaptive, hence a loop rather than a fixed setInterval
(async function pump() {
  for (;;) {
    if (!mode || mode === "solo") {           // solo never talks to the server
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    const started = performance.now();
    try {
      await sync(null, true);
    } catch (e) {
      if (e.name !== "AbortError") {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    // floor between requests so a server that answers instantly cannot spin us
    const gap = 90 - (performance.now() - started);
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
  }
})();

for (const btn of document.querySelectorAll("[data-lang-picker]")) {
  btn.addEventListener("click", () => {
    setLanguage(btn.getAttribute("data-lang-picker"));
  });
}

window.addEventListener("languagechange", () => {
  setExercise(exercise);
  if (server && mode && mode !== "solo") render();
  if (mode === "solo") $("solo-title").textContent = t("solo.title", { exercise: exLabel() });
});

applyTranslations();
setExercise(exercise);   // also paints the brand shown while the camera starts
show("load");
initCamera();
