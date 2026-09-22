"""Wrapper na MediaPipe PoseLandmarker - pobiera model i zwraca landmarki klatki."""
from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path
from typing import Optional

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    RunningMode,
)

from .geometry import Landmarks

MODELS = {
    "lite": "pose_landmarker_lite",
    "full": "pose_landmarker_full",
    "heavy": "pose_landmarker_heavy",
}
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "{name}/float16/latest/{name}.task"
)
MODEL_DIR = Path(__file__).resolve().parent.parent / "models"


def ensure_model(variant: str = "full") -> Path:
    """Zwraca sciezke do pliku modelu, pobierajac go przy pierwszym uruchomieniu."""
    if variant not in MODELS:
        raise ValueError(f"Unknown model: {variant}. Available: {', '.join(MODELS)}")
    name = MODELS[variant]
    path = MODEL_DIR / f"{name}.task"
    if path.exists() and path.stat().st_size > 1_000_000:
        return path
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    url = MODEL_URL.format(name=name)
    print(f"Downloading pose model ({variant})...", file=sys.stderr)
    tmp = path.with_suffix(".part")
    urllib.request.urlretrieve(url, tmp)
    os.replace(tmp, path)
    print(f"Saved {path}", file=sys.stderr)
    return path


class PoseEstimator:
    """Wykrywa sylwetke na kolejnych klatkach wideo/kamery."""

    def __init__(
        self,
        model: str = "full",
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ):
        model_path = ensure_model(model)
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=min_detection_confidence,
            min_pose_presence_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self._landmarker = PoseLandmarker.create_from_options(options)
        self._last_ts = -1

    def detect(self, frame_bgr: np.ndarray, timestamp_ms: int) -> Optional[Landmarks]:
        """frame_bgr: klatka z OpenCV. Zwraca Landmarks albo None, gdy nie widac osoby."""
        # MediaPipe wymaga scisle rosnacych znacznikow czasu
        if timestamp_ms <= self._last_ts:
            timestamp_ms = self._last_ts + 1
        self._last_ts = timestamp_ms

        rgb = frame_bgr[:, :, ::-1]
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = self._landmarker.detect_for_video(image, timestamp_ms)
        if not result.pose_landmarks:
            return None
        h, w = frame_bgr.shape[:2]
        return Landmarks(result.pose_landmarks[0], w, h)

    def close(self) -> None:
        self._landmarker.close()

    def __enter__(self) -> "PoseEstimator":
        return self

    def __exit__(self, *exc) -> None:
        self.close()
