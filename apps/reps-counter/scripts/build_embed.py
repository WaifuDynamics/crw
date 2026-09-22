"""Buduje paczke dla osob, ktore chca osadzic widget na swojej stronie.

    python scripts/build_embed.py              # -> dist/pushups-embed.zip
    python scripts/build_embed.py --server https://pushups.example.com

Paczka zawiera README, strone przykladowa i kopie embed.js do wgladu.
Sam skrypt na stronie jest i tak ladowany z serwera gry, zeby poprawki
docieraly do wszystkich bez ponownego rozsylania paczki.
"""
from __future__ import annotations

import argparse
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SERVER = "https://pompki.szybki-drop.pl"

FILES = {
    "README.md": ROOT / "embed" / "README.md",
    "example.html": ROOT / "embed" / "example.html",
    "embed.js": ROOT / "web" / "embed.js",
}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--server", default=DEFAULT_SERVER,
                    help="adres serwera gry wpisany w README i przyklad")
    ap.add_argument("--out", type=Path, default=ROOT / "dist" / "pushups-embed.zip")
    a = ap.parse_args(argv)

    server = a.server.rstrip("/")
    if not re.match(r"^https://[^/\s]+$", server):
        print("--server musi byc adresem https bez sciezki, np. https://pushups.example.com",
              file=sys.stderr)
        return 2

    version = re.search(r'VERSION = "([^"]+)"', FILES["embed.js"].read_text(encoding="utf-8"))
    version = version.group(1) if version else "dev"

    a.out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(a.out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, src in FILES.items():
            text = src.read_text(encoding="utf-8")
            if name != "embed.js":
                text = text.replace(DEFAULT_SERVER, server)
            z.writestr(f"pushups-embed/{name}", text)

    size = a.out.stat().st_size / 1024
    print(f"{a.out}  ({size:.1f} kB, embed.js v{version}, serwer {server})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
