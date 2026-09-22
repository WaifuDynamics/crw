"""App loop: video or camera -> pose -> counter -> preview/output."""
from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2

from .counter import PushupCounter, Rep
from .exercises import DEFAULT_EXERCISE, EXERCISES
from .geometry import Landmarks, key_visibility
from .overlay import draw_hud, draw_skeleton
from .pose import PoseEstimator

MIN_KEY_VISIBILITY = 0.4


@dataclass
class Options:
    source: object = 0               # indeks kamery albo sciezka do pliku
    is_camera: bool = True
    model: str = "full"
    exercise: str = DEFAULT_EXERCISE
    up: Optional[float] = None       # None = progi startowe cwiczenia
    down: Optional[float] = None
    adaptive: bool = True
    smoothing: float = 0.5
    mirror: bool = True              # lustro dla kamery
    show: bool = True
    save_video: Optional[Path] = None
    save_json: Optional[Path] = None
    save_csv: Optional[Path] = None
    max_width: int = 960
    beep: bool = False
    realtime: bool = True            # dla pliku: odtwarzaj w tempie nagrania


def _beep() -> None:
    try:
        import winsound

        winsound.Beep(880, 90)
    except Exception:
        sys.stdout.write("\a")
        sys.stdout.flush()


def _open_capture(opts: Options) -> cv2.VideoCapture:
    if opts.is_camera:
        # CAP_DSHOW startuje na Windowsie duzo szybciej niz domyslny backend
        cap = cv2.VideoCapture(int(opts.source), cv2.CAP_DSHOW) if sys.platform == "win32" \
            else cv2.VideoCapture(int(opts.source))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    else:
        cap = cv2.VideoCapture(str(opts.source))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open source: {opts.source}")
    return cap


def _resize(frame, max_width: int):
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    s = max_width / w
    return cv2.resize(frame, (max_width, int(h * s)), interpolation=cv2.INTER_AREA)


def run(opts: Options) -> dict:
    cap = _open_capture(opts)
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    if not src_fps or src_fps <= 1 or src_fps > 240:
        src_fps = 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if not opts.is_camera else 0

    ex = EXERCISES[opts.exercise]
    counter = PushupCounter(
        up_threshold=opts.up if opts.up is not None else ex.up,
        down_threshold=opts.down if opts.down is not None else ex.down,
        adaptive=opts.adaptive,
        smoothing=opts.smoothing,
    )

    writer = None
    paused = False
    flash = 0.0
    status = ""
    status_until = 0.0
    frame_i = 0
    fps_disp = 0.0
    fps_t0 = time.perf_counter()
    fps_n = 0
    wall_t0 = time.perf_counter()
    last_frame = None
    window = "Licznik pompek"

    if opts.show:
        cv2.namedWindow(window, cv2.WINDOW_NORMAL)

    estimator = PoseEstimator(model=opts.model)
    try:
        while True:
            if not paused:
                ok, frame = cap.read()
                if not ok:
                    break
                frame_i += 1
                frame = _resize(frame, opts.max_width)
                if opts.is_camera and opts.mirror:
                    frame = cv2.flip(frame, 1)

                # czas: dla pliku z pozycji w nagraniu, dla kamery - zegar scienny
                if opts.is_camera:
                    t = time.perf_counter() - wall_t0
                else:
                    pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                    t = (pos_ms / 1000.0) if pos_ms and pos_ms > 0 else frame_i / src_fps

                lm: Optional[Landmarks] = estimator.detect(frame, int(t * 1000))

                if lm is not None and key_visibility(lm, ex.id) >= ex.min_visibility:
                    rep = counter.update(
                        lm.elbow_angle() if ex.joint == "elbow" else lm.knee_angle(ex.min_visibility),
                        t,
                        depth=lm.depth_ratio(),
                        straightness=lm.straightness() if ex.form_check else None,
                    )
                    draw_skeleton(frame, lm)
                    if rep is not None:
                        flash = 1.0
                        form = "" if rep.good_form else "  (hips!)"
                        print(
                            f"#{rep.index:3d}  t={rep.t_end:6.2f}s  "
                            f"time={rep.duration:.2f}s  range={rep.rom:.0f}deg{form}",
                            flush=True,
                        )
                        if opts.beep:
                            _beep()
                    if rep is None and counter.state == "up" and counter.straightness is not None \
                            and counter.straightness < 145:
                        status, status_until = "Straighten up - hips are sagging", t + 0.8
                else:
                    counter.lost_person(t)
                    status, status_until = "Can't see your whole body", t + 0.3

                if status and t > status_until:
                    status = ""

                fps_n += 1
                now = time.perf_counter()
                if now - fps_t0 >= 0.5:
                    fps_disp = fps_n / (now - fps_t0)
                    fps_t0, fps_n = now, 0

                draw_hud(
                    frame,
                    counter,
                    title=ex.label.upper(),
                    fps=fps_disp,
                    elapsed=t,
                    status=status,
                    flash=flash,
                    paused=False,
                )
                flash = max(0.0, flash - 0.15)
                last_frame = frame

                if opts.save_video is not None:
                    if writer is None:
                        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                        h, w = frame.shape[:2]
                        opts.save_video.parent.mkdir(parents=True, exist_ok=True)
                        writer = cv2.VideoWriter(str(opts.save_video), fourcc, src_fps, (w, h))
                    writer.write(frame)

                if not opts.show and total_frames and frame_i % 30 == 0:
                    pct = 100 * frame_i / total_frames
                    print(f"  ...{pct:5.1f}%  ({counter.count} reps)", end="\r", flush=True)

            if opts.show and last_frame is not None:
                cv2.imshow(window, last_frame)
                # tempo odtwarzania pliku zblizone do oryginalnego
                delay = 1
                if not opts.is_camera and opts.realtime:
                    delay = max(1, int(1000 / src_fps))
                key = cv2.waitKey(delay) & 0xFF
                if key in (ord("q"), 27):
                    break
                if key == ord("r"):
                    counter.reset()
                    print("-- counter reset --", flush=True)
                if key == ord(" "):
                    paused = not paused
                if cv2.getWindowProperty(window, cv2.WND_PROP_VISIBLE) < 1:
                    break
    finally:
        estimator.close()
        cap.release()
        if writer is not None:
            writer.release()
        if opts.show:
            cv2.destroyAllWindows()

    summary = counter.summary()
    summary["source"] = str(opts.source)
    summary["exercise"] = ex.id
    summary["frames"] = frame_i

    if opts.save_json is not None:
        opts.save_json.parent.mkdir(parents=True, exist_ok=True)
        opts.save_json.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    if opts.save_csv is not None:
        _write_csv(opts.save_csv, counter.reps)

    return summary


def _write_csv(path: Path, reps: list[Rep]) -> None:
    import csv

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["no", "start_s", "bottom_s", "end_s", "duration_s", "range_deg",
                     "min_angle", "max_angle", "form_min", "good_form"])
        for r in reps:
            wr.writerow([
                r.index,
                round(r.t_start, 3),
                round(r.t_bottom, 3),
                round(r.t_end, 3),
                round(r.duration, 3),
                round(r.rom, 1),
                round(r.min_angle, 1),
                round(r.max_angle, 1),
                round(r.min_straightness, 1) if r.min_straightness is not None else "",
                int(r.good_form),
            ])


def print_summary(s: dict) -> None:
    print()
    print("=" * 46)
    label = EXERCISES.get(s.get("exercise", DEFAULT_EXERCISE), EXERCISES[DEFAULT_EXERCISE]).label.upper()
    print(f"  {label}: {s['count']}")
    if s["count"]:
        print(f"  cadence (rep every)     : {s['avg_cadence_s']} s")
        print(f"  average rep time        : {s['avg_rep_s']} s")
        print(f"  fastest / slowest       : {s['fastest_rep_s']} s / {s['slowest_rep_s']} s")
        print(f"  average range of motion : {s['avg_rom_deg']} deg")
        if s["form_checked_reps"]:
            print(f"  good form               : {s['good_form_reps']}/{s['form_checked_reps']}"
                  f" assessed")
        else:
            reason = ("not measured for this exercise" if s.get("exercise") == "squat"
                      else "legs out of frame")
            print(f"  form                    : not assessed ({reason})")
    th = s["thresholds"]
    print(f"  angle thresholds        : {th['down']} / {th['up']}"
          f"{'  [auto-calibrated]' if th['adaptive'] else ''}")
    print("=" * 46)
