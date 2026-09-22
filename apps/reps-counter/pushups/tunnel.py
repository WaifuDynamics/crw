"""Running cloudflared alongside the server.

Tunel zalatwia najwazniejszy problem wersji web: przegladarka udostepnia kamere
tylko w bezpiecznym kontekscie, a tunel daje prawdziwy HTTPS z waznym certyfikatem.
Dzieki temu drugi gracz nie musi klikac przez ostrzezenia o certyfikacie
self-signed ani byc w tej samej sieci.

Dwa tryby:
  szybki   - adres losowy na trycloudflare.com, bez konta i bez konfiguracji
  nazwany  - wlasna domena; wymaga jednorazowego `cloudflared tunnel login`
"""
from __future__ import annotations

import base64
import json
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

CF_DIR = Path.home() / ".cloudflared"
QUICK_URL = re.compile(rb"https://[a-z0-9-]+\.trycloudflare\.com")
READY = re.compile(rb"Registered tunnel connection|Connection [0-9a-f-]+ registered")


def find_cloudflared() -> str | None:
    exe = shutil.which("cloudflared")
    if exe:
        return exe
    # typowe miejsca instalacji na Windowsie, gdy PATH nie zostal odswiezony
    for p in (
        r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
        r"C:\Program Files\cloudflared\cloudflared.exe",
    ):
        if Path(p).exists():
            return p
    return None


def is_logged_in() -> bool:
    return (CF_DIR / "cert.pem").exists()


def install_hint() -> str:
    return (
        "cloudflared not found. Install it with:\n"
        "    winget install --id Cloudflare.cloudflared\n"
        "then open a new terminal so PATH is refreshed."
    )


def login_hint(hostname: str) -> str:
    return (
        f"A named tunnel on {hostname} needs a one-off login.\n"
        "Do it yourself - it opens a browser and picks a domain on your account:\n\n"
        "    cloudflared tunnel login\n\n"
        "Then run again with --hostname. Creating the tunnel and the DNS record\n"
        "is handled from here."
    )


class Tunnel:
    """Proces cloudflared zyjacy tak dlugo, jak serwer."""

    def __init__(self, port: int, hostname: str | None = None, name: str = "pompki",
                 force_dns: bool = False):
        self.port = port
        self.hostname = hostname
        self.name = name
        self.force_dns = force_dns
        self.proc: subprocess.Popen | None = None
        self.url: str | None = None
        self._exe = find_cloudflared()

    # --- tunel nazwany ---

    def _run(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run([self._exe, *args], capture_output=True, text=True, check=check)

    def _tunnel_id(self) -> str | None:
        listed = self._run("tunnel", "list", "--output", "json", check=False)
        try:
            for t in json.loads(listed.stdout or "[]"):
                if t.get("name") == self.name:
                    return t.get("id")
        except json.JSONDecodeError:
            pass
        return None

    def _existing_dns(self) -> dict | None:
        """Co obecnie stoi pod tym hostem. None, gdy nic - albo gdy nie da sie sprawdzic."""
        try:
            cert = (CF_DIR / "cert.pem").read_text()
            m = re.search(r"-----BEGIN ARGO TUNNEL TOKEN-----(.*?)-----END ARGO TUNNEL TOKEN-----",
                          cert, re.S)
            tok = json.loads(base64.b64decode(re.sub(r"\s+", "", m.group(1))))
            url = (f"https://api.cloudflare.com/client/v4/zones/{tok['zoneID']}"
                   f"/dns_records?name={self.hostname}")
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok['apiToken']}"})
            res = json.load(urllib.request.urlopen(req, timeout=20))
            return (res.get("result") or [None])[0]
        except Exception:
            return None

    def _ensure_named(self, force_dns: bool = False) -> None:
        """Tworzy tunel i wpis DNS, jesli ich jeszcze nie ma."""
        if not self._tunnel_id():
            print(f"Creating tunnel '{self.name}'...", file=sys.stderr)
            r = self._run("tunnel", "create", self.name, check=False)
            if r.returncode != 0 and "already exists" not in (r.stderr or ""):
                raise RuntimeError(f"cloudflared tunnel create: {r.stderr.strip()}")

        # Nadpisanie DNS-u potrafi skasowac cudzy, dzialajacy wpis - np. literowka
        # w --hostname trafiajaca w inna usluge na tej samej domenie. Nadpisujemy
        # tylko wpis, ktory i tak nalezy do tego tunelu.
        tid = self._tunnel_id()
        rec = self._existing_dns()
        mine = bool(rec and tid and tid in str(rec.get("content", "")))
        if rec and not mine and not force_dns:
            raise RuntimeError(
                f"{self.hostname} already has a DNS record:\n"
                f"    {rec.get('type')} -> {rec.get('content')}\n"
                "Leaving it alone. Pick another name with --hostname, or add --force-dns\n"
                "if it really should be replaced."
            )

        print(f"Pointing {self.hostname} at the tunnel...", file=sys.stderr)
        args = ["tunnel", "route", "dns"]
        if rec:
            args.append("--overwrite-dns")
        args += [self.name, self.hostname]
        r = self._run(*args, check=False)
        if r.returncode != 0 and "already exists" not in (r.stderr or ""):
            raise RuntimeError(f"cloudflared tunnel route dns: {r.stderr.strip()}")

    # --- start/stop ---

    def start(self, timeout: float = 45.0) -> str:
        if not self._exe:
            raise RuntimeError(install_hint())

        if self.hostname:
            if not is_logged_in():
                raise RuntimeError(login_hint(self.hostname))
            self._ensure_named(self.force_dns)
            args = [self._exe, "tunnel", "run", "--url", f"http://localhost:{self.port}", self.name]
            self.url = f"https://{self.hostname}"
        else:
            args = [self._exe, "tunnel", "--url", f"http://localhost:{self.port}",
                    "--no-autoupdate"]

        self.proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

        ready = threading.Event()
        lines: list[bytes] = []

        def pump():
            assert self.proc and self.proc.stdout
            for raw in self.proc.stdout:
                lines.append(raw)
                if self.url is None:
                    m = QUICK_URL.search(raw)
                    if m:
                        self.url = m.group(0).decode()
                if self.url and READY.search(raw):
                    ready.set()

        threading.Thread(target=pump, daemon=True).start()

        deadline = time.time() + timeout
        while time.time() < deadline:
            if ready.is_set():
                return self.url
            if self.proc.poll() is not None:
                tail = b"".join(lines[-12:]).decode(errors="replace")
                raise RuntimeError(f"cloudflared exited immediately:\n{tail}")
            time.sleep(0.2)

        if self.url:          # adres jest, brak tylko potwierdzenia polaczenia
            return self.url
        tail = b"".join(lines[-12:]).decode(errors="replace")
        raise RuntimeError(f"cloudflared did not come up within {timeout:.0f}s:\n{tail}")

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
