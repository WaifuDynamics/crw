"""CLI entry point: python -m pushups [options]"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .app import Options, print_summary, run
from .exercises import DEFAULT_EXERCISE, EXERCISES


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="pushups",
        description="Push-up and squat counter from a camera or a video file (MediaPipe Pose).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""examples:
  python -m pushups                          # default camera
  python -m pushups --camera 1               # second camera
  python -m pushups --video workout.mp4      # video file
  python -m pushups --exercise squat         # count squats
  python -m pushups --video v.mp4 --no-show --json result.json
  python -m pushups --video v.mp4 --save-video result.mp4

window controls:  q = quit, r = reset counter, space = pause""",
    )
    src = p.add_mutually_exclusive_group()
    src.add_argument("--camera", type=int, metavar="N", help="camera index (default 0)")
    src.add_argument("--video", type=str, metavar="FILE", help="path to a video file")

    p.add_argument("--model", choices=("lite", "full", "heavy"), default="full",
                   help="pose model: lite=fastest, heavy=most accurate (default full)")
    p.add_argument("--exercise", choices=tuple(EXERCISES), default=DEFAULT_EXERCISE,
                   help="what to count (default pushup)")
    p.add_argument("--up", type=float, default=None,
                   help="'up' angle threshold in degrees (default depends on --exercise)")
    p.add_argument("--down", type=float, default=None,
                   help="'down' angle threshold in degrees (default depends on --exercise)")
    p.add_argument("--no-adaptive", action="store_true",
                   help="disable auto-calibration of thresholds to the person's range of motion")
    p.add_argument("--smoothing", type=float, default=0.5, metavar="0..1",
                   help="angle smoothing; higher = steadier but slower to react")
    p.add_argument("--no-mirror", action="store_true", help="do not mirror the camera image")
    p.add_argument("--no-show", action="store_true", help="no preview window (fast file processing)")
    p.add_argument("--fast", action="store_true",
                   help="for files: process as fast as possible instead of at playback speed")
    p.add_argument("--width", type=int, default=960, metavar="PX", help="scale frames to this width")
    p.add_argument("--beep", action="store_true", help="beep on every rep")
    p.add_argument("--save-video", type=Path, metavar="FILE", help="save the video with the overlay")
    p.add_argument("--json", type=Path, metavar="FILE", help="save a summary as JSON")
    p.add_argument("--csv", type=Path, metavar="FILE", help="save reps as CSV")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.video:
        video = Path(args.video)
        if not video.exists():
            print(f"No such file: {video}", file=sys.stderr)
            return 2
        source, is_camera = video, False
    else:
        source, is_camera = (args.camera if args.camera is not None else 0), True

    opts = Options(
        source=source,
        is_camera=is_camera,
        model=args.model,
        exercise=args.exercise,
        up=args.up,
        down=args.down,
        adaptive=not args.no_adaptive,
        smoothing=args.smoothing,
        mirror=not args.no_mirror,
        show=not args.no_show,
        save_video=args.save_video,
        save_json=args.json,
        save_csv=args.csv,
        max_width=args.width,
        beep=args.beep,
        realtime=not args.fast,
    )

    if is_camera:
        print(f"Camera {source}. Stand side-on to the lens, "
              f"{'whole body' if args.exercise == 'squat' else 'whole torso'} in frame.")
    else:
        print(f"Analysing {source} ...")

    try:
        summary = run(opts)
    except KeyboardInterrupt:
        print("\nPrzerwano.", file=sys.stderr)
        return 130
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    print_summary(summary)
    if opts.save_json:
        print(f"JSON  -> {opts.save_json}")
    if opts.save_csv:
        print(f"CSV   -> {opts.save_csv}")
    if opts.save_video:
        print(f"Video -> {opts.save_video}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
