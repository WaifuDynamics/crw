// Port pushups/counter.py + pushups/geometry.py. Trzymamy 1:1 z wersja Pythona -
// te same progi, ta sama kolejnosc operacji, te same kryteria odrzucania powtorzen.

export const DEFAULT_UP = 155.0;
export const DEFAULT_DOWN = 100.0;
export const MIN_RANGE = 35.0;
export const OUTSIDE_MARGIN = 0.15;
// Parameters keep their nominal meaning at this rate; see update().
export const REFERENCE_FPS = 30;

// Mirrors pushups/exercises.py. `joint` picks the measured angle; up/down are the
// thresholds used until auto-calibration has seen the person's range of motion.
export const EXERCISES = {
  pushup: { id: "pushup", label: "Push-ups", joint: "elbow", up: 155, down: 100, formCheck: true, minVisibility: 0.4 },
  // Standing knee ~175, parallel squat ~90-100. The shoulder-hip-ankle line
  // bends by design in a squat, so it is not assessed. An ankle at the frame edge
  // scores ~0.4-0.6 and its noisy knee angle produced fake reps; clearly visible
  // legs score ~0.9, hence the stricter visibility.
  squat: { id: "squat", label: "Squats", joint: "knee", up: 160, down: 110, formCheck: false, minVisibility: 0.7 },
};

// Indeksy landmarkow MediaPipe Pose
export const L_SHOULDER = 11, R_SHOULDER = 12;
export const L_ELBOW = 13, R_ELBOW = 14;
export const L_WRIST = 15, R_WRIST = 16;
export const L_HIP = 23, R_HIP = 24;
export const L_KNEE = 25, R_KNEE = 26;
export const L_ANKLE = 27, R_ANKLE = 28;

function angleDeg(a, b, c) {
  const bax = a[0] - b[0], bay = a[1] - b[1];
  const bcx = c[0] - b[0], bcy = c[1] - b[1];
  const na = Math.hypot(bax, bay), nc = Math.hypot(bcx, bcy);
  if (na < 1e-9 || nc < 1e-9) return NaN;
  const cos = (bax * bcx + bay * bcy) / (na * nc);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export class Landmarks {
  constructor(raw, width, height) {
    this.raw = raw;
    this.w = width;
    this.h = height;
  }
  inFrame(i, margin = 0) {
    const p = this.raw[i];
    return p.x >= -margin && p.x <= 1 + margin && p.y >= -margin && p.y <= 1 + margin;
  }
  // MediaPipe ekstrapoluje stawy poza kadr i daje im przyzwoita pewnosc. Tuz za
  // krawedzia to zwykle sensowne, daleko poza - juz zgadywanie.
  vis(i, margin = OUTSIDE_MARGIN) {
    if (!this.inFrame(i, margin)) return 0;
    const p = this.raw[i];
    const vals = [p.visibility, p.presence].filter((v) => v !== undefined && v !== null);
    return vals.length ? Math.min(...vals) : 1;
  }
  xy(i) {
    const p = this.raw[i];
    return [p.x * this.w, p.y * this.h];
  }
  elbowAngle(minVis = 0.3) {
    const out = [];
    for (const [sh, el, wr] of [[L_SHOULDER, L_ELBOW, L_WRIST], [R_SHOULDER, R_ELBOW, R_WRIST]]) {
      if (Math.min(this.vis(sh), this.vis(el), this.vis(wr)) < minVis) continue;
      const a = angleDeg(this.xy(sh), this.xy(el), this.xy(wr));
      if (!Number.isNaN(a)) out.push(a);
    }
    if (!out.length) return null;
    return out.reduce((x, y) => x + y, 0) / out.length;
  }
  kneeAngle(minVis = 0.3) {
    const out = [];
    for (const [hip, knee, ank] of [[L_HIP, L_KNEE, L_ANKLE], [R_HIP, R_KNEE, R_ANKLE]]) {
      if (Math.min(this.vis(hip), this.vis(knee), this.vis(ank)) < minVis) continue;
      const a = angleDeg(this.xy(hip), this.xy(knee), this.xy(ank));
      if (!Number.isNaN(a)) out.push(a);
    }
    if (!out.length) return null;
    return out.reduce((x, y) => x + y, 0) / out.length;
  }
  straightness(minVis = 0.6) {
    for (const [lowL, lowR] of [[L_ANKLE, R_ANKLE], [L_KNEE, R_KNEE]]) {
      const out = [];
      for (const [sh, hip, low] of [[L_SHOULDER, L_HIP, lowL], [R_SHOULDER, R_HIP, lowR]]) {
        if (Math.min(this.vis(sh, 0), this.vis(hip, 0), this.vis(low, 0)) < minVis) continue;
        const a = angleDeg(this.xy(sh), this.xy(hip), this.xy(low));
        if (!Number.isNaN(a)) out.push(a);
      }
      if (out.length) return out.reduce((x, y) => x + y, 0) / out.length;
    }
    return null;
  }
}

// Push-ups need one complete arm (hips and legs are often out of a tight frame).
// Squats need one complete leg - without the ankle the knee angle is a guess.
export function keyVisibility(lm, exercise = "pushup") {
  if (exercise === "squat") {
    const left = Math.min(lm.vis(L_HIP), lm.vis(L_KNEE), lm.vis(L_ANKLE));
    const right = Math.min(lm.vis(R_HIP), lm.vis(R_KNEE), lm.vis(R_ANKLE));
    return Math.max(left, right);
  }
  const left = Math.min(lm.vis(L_SHOULDER), lm.vis(L_ELBOW), lm.vis(L_WRIST));
  const right = Math.min(lm.vis(R_SHOULDER), lm.vis(R_ELBOW), lm.vis(R_WRIST));
  return Math.max(left, right);
}

class AdaptiveThresholds {
  constructor(up = DEFAULT_UP, down = DEFAULT_DOWN, enabled = true, windowS = 20.0) {
    this.fixedUp = up;
    this.fixedDown = down;
    this.enabled = enabled;
    this.windowS = windowS;
    this.samples = [];
    this.lo = null;
    this.hi = null;
    this.dirty = 0;
  }
  observe(angle, t) {
    this.samples.push([t, angle]);
    const cutoff = t - this.windowS;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop][0] < cutoff) drop++;
    if (drop) this.samples.splice(0, drop);
    this.dirty++;
    if (this.dirty >= 5 || this.lo === null) {
      this.dirty = 0;
      this.recompute();
    }
  }
  recompute() {
    if (this.samples.length < 10) return;
    const vals = this.samples.map((s) => s[1]).sort((a, b) => a - b);
    const n = vals.length;
    this.lo = vals[Math.max(0, Math.floor(0.05 * n))];
    this.hi = vals[Math.min(n - 1, Math.floor(0.95 * n))];
  }
  get calibrated() {
    return this.enabled && this.lo !== null && this.hi !== null && this.hi - this.lo >= MIN_RANGE;
  }
  get down() {
    return this.calibrated ? this.lo + 0.3 * (this.hi - this.lo) : this.fixedDown;
  }
  get up() {
    return this.calibrated ? this.lo + 0.7 * (this.hi - this.lo) : this.fixedUp;
  }
}

export class PushupCounter {
  constructor(opts = {}) {
    const {
      upThreshold = DEFAULT_UP,
      downThreshold = DEFAULT_DOWN,
      adaptive = true,
      smoothing = 0.5,
      minRepS = 0.35,
      maxRepS = 15.0,
      minRom = MIN_RANGE,
      confirmFrames = 2,
    } = opts;
    this.th = new AdaptiveThresholds(upThreshold, downThreshold, adaptive);
    this.smoothing = Math.max(0, Math.min(1, smoothing));
    this.minRepS = minRepS;
    this.maxRepS = maxRepS;
    this.minRom = minRom;
    // Potwierdzenie tylko GORNEJ pozycji: szczyt jest szeroki, dno przy ~1 s na
    // powtorzenie trwa czesto jedna klatke i kazde opoznienie gubi zliczenia.
    this.confirmFrames = Math.max(1, confirmFrames);

    this.reps = [];
    this.state = "unknown";
    this.angle = null;
    this.rawAngle = null;
    this.straight = null;
    this.upStreak = 0;
    this.downStreak = 0;
    this.lastT = null;
    this.dt = 1 / REFERENCE_FPS;
    this.resetRep();
  }

  get count() {
    return this.reps.length;
  }

  get progress() {
    if (this.angle === null) return 0;
    const up = this.th.up, down = this.th.down;
    if (up <= down) return 0;
    return Math.max(0, Math.min(1, (up - this.angle) / (up - down)));
  }

  reset() {
    this.reps = [];
    this.state = "unknown";
    this.angle = null;
    this.upStreak = 0;
    this.downStreak = 0;
    this.resetRep();
  }

  resetRep() {
    this.tUpStart = null;
    this.tBottom = null;
    this.minAngle = 180;
    this.maxAngle = 0;
    this.minStraight = null;
  }

  startRep(t) {
    this.tUpStart = t;
    this.tBottom = null;
    this.minAngle = this.rawAngle !== null ? this.rawAngle : 180;
    this.maxAngle = this.rawAngle !== null ? this.rawAngle : 0;
    this.minStraight = null;
  }

  update(angle, t, straightness = null) {
    this.rawAngle = angle;
    if (angle === null || angle === undefined) return null;

    // Detection does not always run at 30 fps - a weak phone or a machine without
    // GPU can manage 4-6 - so smoothing and confirmation work in time, not frames.
    const dt = this.lastT === null ? 1 / REFERENCE_FPS : Math.min(1, Math.max(0, t - this.lastT));
    this.dt = dt;
    this.lastT = t;

    this.straight = straightness;
    // `smoothing` is the weight of the previous value at 30 fps; with sparser
    // samples it decays, because the previous value is older. A fixed 0.5 at
    // 4 fps flattened the whole movement and most reps were lost.
    const w = Math.pow(this.smoothing, dt * REFERENCE_FPS);
    this.angle = this.angle === null ? angle : (1 - w) * angle + w * this.angle;

    const sm = this.angle;
    // zakres ruchu z surowego kata - EMA scialaby amplitude
    this.th.observe(angle, t);
    if (angle < this.minAngle) {
      this.minAngle = angle;
      if (this.state === "down") this.tBottom = t;
    }
    if (angle > this.maxAngle) this.maxAngle = angle;
    if (straightness !== null && straightness !== undefined) {
      this.minStraight = this.minStraight === null
        ? straightness
        : Math.min(this.minStraight, straightness);
    }

    const up = this.th.up, down = this.th.down;
    this.upStreak = sm >= up ? this.upStreak + 1 : 0;
    this.downStreak = sm <= down ? this.downStreak + 1 : 0;
    // Confirming the top filters one-frame detection glitches. When samples arrive
    // further apart than two 30 fps frames, one sample already spans that time -
    // otherwise the top (~0.3 s) could never be confirmed at 4 fps.
    const atTop = this.upStreak >= this.confirmFrames ||
      (this.upStreak >= 1 && this.dt >= this.confirmFrames / REFERENCE_FPS);
    const atBottom = this.downStreak >= 1;

    if (this.state === "unknown") {
      if (atTop) {
        this.state = "up";
        this.startRep(t);
      }
      return null;
    }

    if (this.state === "up") {
      if (atBottom) {
        this.state = "down";
        this.tBottom = t;
        this.minAngle = angle;
        this.minStraight = straightness ?? null;
      } else if (atTop) {
        // takze podczas odpoczynku w gorze - przerwa nie liczy sie do czasu powtorzenia
        this.tUpStart = t;
        this.minAngle = angle;
        this.maxAngle = Math.max(this.maxAngle, angle);
      }
      return null;
    }

    // state === "down"
    if (atTop) {
      const rep = this.finishRep(t);
      this.state = "up";
      this.startRep(t);
      return rep;
    }
    return null;
  }

  finishRep(t) {
    const t0 = this.tUpStart !== null ? this.tUpStart : t;
    const dur = t - t0;
    const rom = this.maxAngle - this.minAngle;
    if (dur < this.minRepS || dur > this.maxRepS || rom < this.minRom) return null;
    const rep = {
      index: this.reps.length + 1,
      tStart: t0,
      tBottom: this.tBottom !== null ? this.tBottom : t0,
      tEnd: t,
      minAngle: this.minAngle,
      maxAngle: this.maxAngle,
      rom,
      duration: dur,
      minStraightness: this.minStraight,
      goodForm: this.minStraight === null || this.minStraight >= 150,
    };
    this.reps.push(rep);
    return rep;
  }
}
