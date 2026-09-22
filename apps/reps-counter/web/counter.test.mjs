// Te same przypadki co tests/test_counter.py - port musi liczyc identycznie.
import assert from "node:assert";
import { test } from "node:test";
import { PushupCounter, Landmarks, keyVisibility } from "./counter.js";

function synthReps(c, n, { top = 170, bottom = 80, period = 2.0, fps = 30, noise = 0, t0 = 0, seed = 1 } = {}) {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  let t = t0;
  const dt = 1 / fps;
  const steps = Math.round(period * fps);
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < steps; i++) {
      const phase = (2 * Math.PI * i) / steps;
      const mid = (top + bottom) / 2;
      const amp = (top - bottom) / 2;
      let angle = mid + amp * Math.cos(phase);
      if (noise) angle += (rnd() * 2 - 1) * noise;
      c.update(angle, t);
      t += dt;
    }
  }
  for (let i = 0; i < Math.round(0.3 * fps); i++) {
    c.update(top, t);
    t += dt;
  }
  return t;
}

test("liczy czyste powtorzenia", () => {
  const c = new PushupCounter();
  synthReps(c, 10);
  assert.strictEqual(c.count, 10);
});

test("liczy mimo szumu landmarkow", () => {
  const c = new PushupCounter();
  synthReps(c, 12, { noise: 6 });
  assert.strictEqual(c.count, 12);
});

test("bujanie na prostych rekach to nie pompka", () => {
  const c = new PushupCounter({ adaptive: false });
  synthReps(c, 8, { top: 175, bottom: 160 });
  assert.strictEqual(c.count, 0);
});

test("auto-kalibracja lapie plytkie, ale prawdziwe powtorzenia", () => {
  const fixed = new PushupCounter({ adaptive: false, upThreshold: 160, downThreshold: 90 });
  synthReps(fixed, 10, { top: 140, bottom: 95 });
  assert.strictEqual(fixed.count, 0);

  const ad = new PushupCounter({ adaptive: true, upThreshold: 160, downThreshold: 90 });
  synthReps(ad, 10, { top: 140, bottom: 95 });
  assert.ok(ad.count >= 8, `dostalem ${ad.count}`);
});

test("przerwa miedzy seriami nie zawyza czasu powtorzenia", () => {
  const c = new PushupCounter();
  let t = synthReps(c, 3, { period: 1.5 });
  for (let i = 0; i < 900; i++) {
    c.update(170, t);
    t += 1 / 30;
  }
  synthReps(c, 3, { period: 1.5, t0: t });
  assert.strictEqual(c.count, 6);
  assert.ok(Math.max(...c.reps.map((r) => r.duration)) < 3.0);
});

test("zniknieciez kadru nie kasuje licznika", () => {
  const c = new PushupCounter();
  let t = synthReps(c, 5);
  for (let i = 0; i < 60; i++) {
    c.update(null, t);
    t += 1 / 30;
  }
  synthReps(c, 5, { t0: t });
  assert.strictEqual(c.count, 10);
});

test("jednoklatkowy artefakt nie tworzy powtorzenia", () => {
  const c = new PushupCounter();
  let t = 0;
  for (let i = 0; i < 200; i++) {
    c.update(i === 100 ? 179 : 80, t);
    t += 1 / 30;
  }
  assert.strictEqual(c.count, 0);
});

test("artefakty w trakcie nie skracaja powtorzen", () => {
  const c = new PushupCounter();
  let t = 0, n = 0;
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 30; i++) {
      const phase = (2 * Math.PI * i) / 30;
      let angle = 125 + 45 * Math.cos(phase);
      if (n % 47 === 0) angle = 178;
      c.update(angle, t);
      t += 1 / 30;
      n++;
    }
  }
  for (let i = 0; i < 10; i++) {
    c.update(170, t);
    t += 1 / 30;
  }
  assert.strictEqual(c.count, 5);
});

// --- geometria ---
const LM = (x, y, v = 0.9) => ({ x, y, z: 0, visibility: v, presence: v });
const make = (over = {}) => {
  const pts = Array.from({ length: 33 }, () => LM(0.5, 0.5));
  for (const [i, p] of Object.entries(over)) pts[i] = p;
  return new Landmarks(pts, 1920, 1080);
};

test("punkt tuz poza kadrem nadal sie liczy", () => {
  assert.ok(make({ 15: LM(0.5, 1.06) }).vis(15) > 0.5);
});

test("punkt daleko poza kadrem odpada", () => {
  assert.strictEqual(make({ 27: LM(-0.6, 0.45, 0.57) }).vis(27), 0);
});

test("bramka liczenia ignoruje biodra", () => {
  assert.ok(keyVisibility(make({ 23: LM(0.5, 0.5, 0), 24: LM(0.5, 0.5, 0) })) > 0.5);
});

test("ocena sylwetki odpada, gdy nog nie widac", () => {
  const out = LM(-0.6, 0.45, 0.57);
  assert.strictEqual(make({ 27: out, 28: out, 25: out, 26: out }).straightness(), null);
});

// A person gets into position first. The very first sample has no predecessor,
// so its time span is unknown - the counter deliberately won't confirm the top
// from one sample at stream start.
function holdTop(c, fps, seconds = 0.5, angle = 170) {
  let t = 0;
  for (let i = 0; i < Math.max(2, Math.round(seconds * fps)); i++) {
    c.update(angle, t);
    t += 1 / fps;
  }
  return t;
}

test("liczy przy niskim FPS detekcji", () => {
  for (const fps of [5, 8, 12]) {
    const c = new PushupCounter();
    const t0 = holdTop(c, fps);
    synthReps(c, 10, { period: 1.0, fps, t0 });
    assert.strictEqual(c.count, 10, `${fps} fps: ${c.count}`);
  }
});

test("niski FPS z szumem", () => {
  const c = new PushupCounter();
  const t0 = holdTop(c, 6);
  synthReps(c, 10, { period: 1.2, fps: 6, noise: 5, t0 });
  assert.strictEqual(c.count, 10, `${c.count}`);
});

// --- squats ---
import { EXERCISES } from "./counter.js";

test("kat w kolanie: stojac i w przysiadzie", () => {
  const standing = make({ 23: LM(0.5, 0.3), 25: LM(0.5, 0.5), 27: LM(0.5, 0.7) });
  const bent = make({ 23: LM(0.3, 0.5), 25: LM(0.5, 0.5), 27: LM(0.5, 0.7) });
  assert.ok(standing.kneeAngle() > 175);
  assert.ok(Math.abs(bent.kneeAngle() - 90) < 1);
});

test("przysiad wymaga nogi, pompka reki", () => {
  const noKnees = make({ 25: LM(0.5, 0.5, 0), 26: LM(0.5, 0.5, 0) });
  assert.ok(keyVisibility(noKnees) > 0.5);
  assert.strictEqual(keyVisibility(noKnees, "squat"), 0);
  const noElbows = make({ 13: LM(0.5, 0.5, 0), 14: LM(0.5, 0.5, 0) });
  assert.ok(keyVisibility(noElbows, "squat") > 0.5);
  assert.strictEqual(keyVisibility(noElbows), 0);
});

test("progi przysiadu licza wolne, glebokie powtorzenia", () => {
  const ex = EXERCISES.squat;
  const c = new PushupCounter({ upThreshold: ex.up, downThreshold: ex.down });
  synthReps(c, 8, { top: 175, bottom: 85, period: 2.5 });
  assert.strictEqual(c.count, 8);
});

test("kolysanie na stojaco to nie przysiad", () => {
  const ex = EXERCISES.squat;
  const c = new PushupCounter({ upThreshold: ex.up, downThreshold: ex.down });
  synthReps(c, 8, { top: 178, bottom: 160, period: 2.0 });
  assert.strictEqual(c.count, 0);
});

test("przysiad ignoruje kostke na krawedzi kadru", () => {
  const ex = EXERCISES.squat;
  const edge = LM(0.03, 0.6, 0.5);
  const lm = make({ 27: edge, 28: edge });
  assert.ok(keyVisibility(lm, "squat") < ex.minVisibility);
  assert.strictEqual(lm.kneeAngle(ex.minVisibility), null);
  assert.ok(keyVisibility(lm) >= EXERCISES.pushup.minVisibility);
});
