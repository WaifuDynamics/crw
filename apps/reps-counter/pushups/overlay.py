"""Drawing the skeleton, counter and stats onto the frame."""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np
from mediapipe.tasks.python.vision import PoseLandmarksConnections

from .counter import PushupCounter
from .geometry import (
    L_ELBOW,
    L_SHOULDER,
    L_WRIST,
    R_ELBOW,
    R_SHOULDER,
    R_WRIST,
    Landmarks,
)

CONNECTIONS = [(c.start, c.end) for c in PoseLandmarksConnections.POSE_LANDMARKS]

WHITE = (255, 255, 255)
GREEN = (80, 220, 100)
AMBER = (40, 190, 250)
RED = (60, 60, 240)
DARK = (28, 26, 24)
FONT = cv2.FONT_HERSHEY_SIMPLEX


def draw_skeleton(frame: np.ndarray, lm: Landmarks, min_vis: float = 0.3) -> None:
    for a, b in CONNECTIONS:
        if lm.vis(a) < min_vis or lm.vis(b) < min_vis:
            continue
        cv2.line(frame, lm.px(a), lm.px(b), (200, 200, 200), 2, cv2.LINE_AA)
    for i in range(len(lm)):
        if lm.vis(i) < min_vis:
            continue
        cv2.circle(frame, lm.px(i), 3, AMBER, -1, cv2.LINE_AA)
    # lokcie - kluczowe dla liczenia, wiec wyrozniamy
    for idx in (L_ELBOW, R_ELBOW, L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST):
        if lm.vis(idx) >= min_vis:
            cv2.circle(frame, lm.px(idx), 7, GREEN, 2, cv2.LINE_AA)


def _panel(frame: np.ndarray, x: int, y: int, w: int, h: int, alpha: float = 0.55) -> None:
    sub = frame[y : y + h, x : x + w]
    if sub.size == 0:
        return
    box = np.full(sub.shape, DARK, dtype=np.uint8)
    cv2.addWeighted(box, alpha, sub, 1 - alpha, 0, sub)


def draw_hud(
    frame: np.ndarray,
    counter: PushupCounter,
    *,
    title: str = "PUSH-UPS",
    fps: float = 0.0,
    elapsed: float = 0.0,
    status: str = "",
    flash: float = 0.0,
    paused: bool = False,
) -> None:
    h, w = frame.shape[:2]
    scale = w / 960.0

    # --- licznik ---
    pw, ph = int(250 * scale), int(130 * scale)
    _panel(frame, int(16 * scale), int(16 * scale), pw, ph)
    cx, cy = int(32 * scale), int(16 * scale)
    cv2.putText(frame, title, (cx, cy + int(34 * scale)), FONT, 0.6 * scale, WHITE, 1, cv2.LINE_AA)
    col = GREEN if flash > 0 else WHITE
    cv2.putText(
        frame,
        str(counter.count),
        (cx, cy + int(108 * scale)),
        FONT,
        2.6 * scale,
        col,
        int(max(2, 3 * scale)),
        cv2.LINE_AA,
    )

    state_txt = {"up": "UP", "down": "DOWN", "unknown": "..."}[counter.state]
    state_col = GREEN if counter.state == "up" else AMBER if counter.state == "down" else (150, 150, 150)
    cv2.putText(
        frame,
        state_txt,
        (cx + int(120 * scale), cy + int(100 * scale)),
        FONT,
        0.9 * scale,
        state_col,
        2,
        cv2.LINE_AA,
    )

    # --- pasek glebokosci ---
    bx, by = w - int(70 * scale), int(30 * scale)
    bw, bh = int(28 * scale), h - int(150 * scale)
    cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), (90, 90, 90), 1, cv2.LINE_AA)
    fill = int(bh * counter.progress)
    if fill > 0:
        c = GREEN if counter.progress > 0.92 else AMBER
        cv2.rectangle(frame, (bx + 1, by + bh - fill), (bx + bw - 1, by + bh - 1), c, -1)
    cv2.putText(frame, "DEEP", (bx - int(6 * scale), by + bh + int(22 * scale)), FONT, 0.45 * scale, WHITE, 1, cv2.LINE_AA)

    # --- pasek dolny ---
    barh = int(52 * scale)
    _panel(frame, 0, h - barh, w, barh, alpha=0.6)
    ty = h - barh + int(33 * scale)
    parts = []
    if counter.angle is not None:
        parts.append(f"angle {counter.angle:5.1f}")
    parts.append(f"thresholds {counter.th.down:.0f}/{counter.th.up:.0f}{'*' if counter.th.calibrated else ''}")
    if counter.straightness is not None:
        parts.append(f"form {counter.straightness:.0f}")
    parts.append(f"time {int(elapsed // 60):d}:{int(elapsed % 60):02d}")
    if fps:
        parts.append(f"{fps:.0f} fps")
    cv2.putText(frame, "   ".join(parts), (int(16 * scale), ty), FONT, 0.55 * scale, WHITE, 1, cv2.LINE_AA)

    hint = "q quit | r reset | space pause"
    (tw, _), _ = cv2.getTextSize(hint, FONT, 0.5 * scale, 1)
    cv2.putText(frame, hint, (w - tw - int(16 * scale), ty), FONT, 0.5 * scale, (180, 180, 180), 1, cv2.LINE_AA)

    # --- komunikaty ---
    if status:
        (tw, th_), _ = cv2.getTextSize(status, FONT, 0.75 * scale, 2)
        x = (w - tw) // 2
        y = int(60 * scale)
        _panel(frame, x - 14, y - th_ - 10, tw + 28, th_ + 22, alpha=0.6)
        cv2.putText(frame, status, (x, y), FONT, 0.75 * scale, RED, 2, cv2.LINE_AA)

    if paused:
        cv2.putText(frame, "PAUSED", (w // 2 - int(70 * scale), h // 2), FONT, 1.4 * scale, WHITE, 3, cv2.LINE_AA)

    if flash > 0:
        cv2.rectangle(frame, (0, 0), (w - 1, h - 1), GREEN, max(4, int(10 * flash * scale)))
