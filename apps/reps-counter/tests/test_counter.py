"""Testy maszyny stanow - syntetyczny przebieg kata w lokciu, bez kamery."""
import math

from pushups.counter import PushupCounter


def synth_reps(counter, n, *, top=170.0, bottom=80.0, period=2.0, fps=30.0,
               noise=0.0, t0=0.0, seed=1):
    """Generuje n gladkich powtorzen (cosinus miedzy top a bottom) i karmi nimi licznik."""
    import random

    rng = random.Random(seed)
    t = t0
    dt = 1.0 / fps
    steps = int(period * fps)
    for _ in range(n):
        for i in range(steps):
            phase = 2 * math.pi * i / steps
            mid = (top + bottom) / 2
            amp = (top - bottom) / 2
            angle = mid + amp * math.cos(phase)
            if noise:
                angle += rng.uniform(-noise, noise)
            counter.update(angle, t)
            t += dt
    # wroc na gore, zeby domknac ostatnie powtorzenie
    for _ in range(int(0.3 * fps)):
        counter.update(top, t)
        t += dt
    return t


def test_counts_clean_reps():
    c = PushupCounter()
    synth_reps(c, 10)
    assert c.count == 10


def test_counts_with_landmark_noise():
    c = PushupCounter()
    synth_reps(c, 12, noise=6.0)
    assert c.count == 12


def test_partial_range_is_not_counted():
    """Lekkie bujanie na prostych rekach to nie pompka."""
    c = PushupCounter(adaptive=False)
    synth_reps(c, 8, top=175.0, bottom=160.0)
    assert c.count == 0


def test_adaptive_catches_shallow_but_real_reps():
    """Ktos nie prostuje do konca (140) i nie schodzi nisko (75) - stale progi by to zgubily."""
    fixed = PushupCounter(adaptive=False, up_threshold=160.0, down_threshold=90.0)
    synth_reps(fixed, 10, top=140.0, bottom=95.0)
    assert fixed.count == 0

    adaptive = PushupCounter(adaptive=True, up_threshold=160.0, down_threshold=90.0)
    synth_reps(adaptive, 10, top=140.0, bottom=95.0)
    assert adaptive.count >= 8


def test_pause_between_sets_does_not_inflate_duration():
    c = PushupCounter()
    t = synth_reps(c, 3, period=1.5)
    # 30 sekund odpoczynku na prostych rekach
    dt = 1 / 30
    for _ in range(30 * 30):
        c.update(170.0, t)
        t += dt
    synth_reps(c, 3, period=1.5, t0=t)
    assert c.count == 6
    assert max(r.duration for r in c.reps) < 3.0


def test_missing_person_does_not_reset_count():
    c = PushupCounter()
    t = synth_reps(c, 5)
    for _ in range(60):
        c.update(None, t)
        t += 1 / 30
    synth_reps(c, 5, t0=t)
    assert c.count == 10


def test_reset():
    c = PushupCounter()
    synth_reps(c, 4)
    assert c.count == 4
    c.reset()
    assert c.count == 0
    assert c.state == "unknown"


def test_summary_shape():
    c = PushupCounter()
    synth_reps(c, 6, period=2.0)
    s = c.summary()
    assert s["count"] == 6
    assert len(s["reps"]) == 6
    # kadencja to tempo (co ile sekund powtorzenie); avg_rep_s to sama faza ruchu,
    # wiec z definicji krotsza - czas spedzony w gornej pozycji sie nie liczy
    assert 1.8 < s["avg_cadence_s"] < 2.2
    assert 0.5 < s["avg_rep_s"] < s["avg_cadence_s"]
    assert s["avg_rom_deg"] > 80


def test_form_flagged_when_hips_sag():
    c = PushupCounter()
    t = 0.0
    dt = 1 / 30
    for i in range(int(2 * 30)):
        phase = 2 * math.pi * i / int(2 * 30)
        angle = 125 + 45 * math.cos(phase)
        c.update(angle, t, straightness=130.0)  # zapadniete biodra
        t += dt
    for _ in range(10):
        c.update(170.0, t)
        t += dt
    assert c.count == 1
    assert not c.reps[0].good_form


def test_single_frame_glitch_does_not_fake_a_rep():
    """Wykrywanie pozy potrafi strzelic jedna klatka zupelnie obok - to nie powtorzenie."""
    c = PushupCounter()
    t = 0.0
    dt = 1 / 30
    for i in range(200):
        angle = 179.0 if i == 100 else 80.0  # caly czas w dole, jeden artefakt
        c.update(angle, t)
        t += dt
    assert c.count == 0


def test_glitch_during_descent_does_not_cut_rep_short():
    c = PushupCounter()
    t = 0.0
    dt = 1 / 30
    n = 0
    for rep in range(5):
        for i in range(30):
            phase = 2 * math.pi * i / 30
            angle = 125 + 45 * math.cos(phase)
            if n % 47 == 0:
                angle = 178.0  # artefakt co ~1.5 s
            c.update(angle, t)
            t += dt
            n += 1
    for _ in range(10):
        c.update(170.0, t)
        t += dt
    assert c.count == 5


def hold_top(counter, fps, seconds=0.5, angle=170.0):
    """Czlowiek najpierw przyjmuje pozycje. Pierwsza probka strumienia nie ma
    poprzedniczki, wiec nie da sie ocenic, ile czasu obejmuje - dlatego licznik
    celowo nie potwierdza gory na podstawie jednej probki na samym starcie."""
    t = 0.0
    for _ in range(max(2, round(seconds * fps))):
        counter.update(angle, t)
        t += 1.0 / fps
    return t


def test_counts_at_low_detection_fps():
    """Slaby telefon albo brak GPU: detekcja 5-12 kl./s zamiast 30.
    Wygladzanie i potwierdzanie liczone w klatkach gubily wtedy wiekszosc powtorzen."""
    for fps in (5, 8, 12):
        c = PushupCounter()
        t0 = hold_top(c, fps)
        synth_reps(c, 10, period=1.0, fps=fps, t0=t0)
        assert c.count == 10, f"{fps} fps: {c.count}"


def test_low_fps_with_noise():
    c = PushupCounter()
    t0 = hold_top(c, 6)
    synth_reps(c, 10, period=1.2, fps=6, noise=5.0, t0=t0)
    assert c.count == 10, c.count


def test_squat_thresholds_count_slow_deep_reps():
    from pushups.exercises import EXERCISES
    ex = EXERCISES["squat"]
    c = PushupCounter(up_threshold=ex.up, down_threshold=ex.down)
    synth_reps(c, 8, top=175.0, bottom=85.0, period=2.5)
    assert c.count == 8


def test_squat_standing_sway_is_not_a_rep():
    from pushups.exercises import EXERCISES
    ex = EXERCISES["squat"]
    c = PushupCounter(up_threshold=ex.up, down_threshold=ex.down)
    synth_reps(c, 8, top=178.0, bottom=160.0, period=2.0)   # lekkie ugiecie kolan
    assert c.count == 0
