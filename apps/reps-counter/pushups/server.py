"""Web version server: static files + matchmaking.

Standard library only. The client polls /api/sync every ~250 ms and gets its whole
view of the state back - for a handful of players that beats WebSockets.

    python -m pushups.server                 # http://localhost:8000
    python -m pushups.server --tunnel        # public HTTPS address
    python -m pushups.server --target 30     # race to 30 reps
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import secrets
import socket
import ssl
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
STATS_FILE = Path(__file__).resolve().parent.parent / "data" / "stats.json"
CERT_DIR = Path(__file__).resolve().parent.parent / ".certs"

# Brak sygnalu tyle sekund = gracz odpadl. Dlugie odpytywanie trzyma zadanie do 5 s,
# a na slabym telefonie liczenie pozy potrafi opoznic kolejne zadanie o kilka
# sekund - przy 8 s obaj gracze wylatywali z meczu z walkowerem.
# The client polls every ~250 ms, so eight silent seconds means the player is gone. The
# old 20 s kept a closed tab counted as online - and matchable - for far too long.
PLAYER_TIMEOUT = 8.0
COUNTDOWN_S = 3.0        # odliczanie po dobraniu pary
MATCH_KEEP_S = 60.0      # jak dlugo zakonczony mecz zostaje w pamieci po odejsciu graczy


MODES = {"1v1": 1, "2v2": 2}     # nazwa trybu -> ilu graczy liczy sie w druzynie
EXERCISES = ("pushup", "squat")  # kazde cwiczenie ma osobne kolejki

# Gdy ktos nie poda nazwy, i tak musi dac sie odroznic od reszty - "Player"
# przy kazdym graczu czyni ekran wyscigu nieczytelnym.
ANIMALS = (
    "Falcon Otter Badger Heron Lynx Marten Bison Osprey Ferret Weasel Stoat Ibex "
    "Kestrel Shrike Tapir Caracal Serval Civet Quokka Dingo Kite Raven Grouse Elk"
).split()


class Stats:
    """Wyniki zakonczonych meczow, trwale miedzy uruchomieniami serwera.

    Gracze nie maja kont, wiec kluczem jest nazwa (bez wielkosci liter). To wystarcza
    do tabeli wynikow i do pokazania komus jego wygranych, a nie udaje tozsamosci.
    """

    def __init__(self, path: Path | None = None):
        # Sciezka rozwiazywana przy tworzeniu, nie przy imporcie - dzieki temu test
        # moze podstawic katalog tymczasowy i nie dopisze sie do prawdziwej tabeli.
        self.path = Path(path) if path else STATS_FILE
        self.lock = threading.Lock()
        self.players: dict[str, dict] = {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            self.players = data.get("players", {})
        except (OSError, json.JSONDecodeError):
            self.players = {}

    def _entry(self, name: str) -> dict:
        key = name.strip().lower()[:24] or "player"
        e = self.players.get(key)
        if not e:
            e = {"name": name.strip()[:24] or "Player", "matches": 0, "wins": 0,
                 "reps": 0, "byMode": {}, "byExercise": {}}
            self.players[key] = e
        e["name"] = name.strip()[:24] or e["name"]
        return e

    def _save(self) -> None:
        # Zapis przez plik tymczasowy: przerwany zapis nie zostawia polowy JSON-a.
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"players": self.players}, indent=1), encoding="utf-8")
            os.replace(tmp, self.path)
        except OSError:
            pass          # brak zapisu nie moze przerwac meczu

    def record(self, mode: str, exercise: str, winners: list[tuple[str, int]],
               losers: list[tuple[str, int]]) -> None:
        with self.lock:
            for name, reps in winners:
                e = self._entry(name)
                e["matches"] += 1
                e["wins"] += 1
                e["reps"] += max(0, int(reps))
                e["byMode"][mode] = e["byMode"].get(mode, 0) + 1
                e["byExercise"][exercise] = e["byExercise"].get(exercise, 0) + 1
            for name, reps in losers:
                e = self._entry(name)
                e["matches"] += 1
                e["reps"] += max(0, int(reps))
            self._save()

    def of(self, name: str) -> dict:
        key = (name or "").strip().lower()[:24]
        with self.lock:
            e = self.players.get(key)
            if not e:
                return {"name": (name or "").strip()[:24], "matches": 0, "wins": 0,
                        "reps": 0, "byMode": {}, "byExercise": {}}
            return json.loads(json.dumps(e))

    def top(self, limit: int = 3) -> list[dict]:
        with self.lock:
            ranked = sorted(
                self.players.values(),
                key=lambda e: (e.get("wins", 0), e.get("reps", 0)),
                reverse=True,
            )
            return json.loads(json.dumps(ranked[:max(1, min(50, limit))]))


class Lobby:
    """Kolejki i trwajace pojedynki. Caly stan pod jednym zamkiem.

    Pojedynek zawsze ma dwie druzyny - w 1v1 sa jednoosobowe, w 2v2 dwuosobowe.
    Wynik druzyny to suma powtorzen jej graczy, wiec jedna sciezka obsluguje
    oba tryby.
    """

    def __init__(self, target: int = 20, stats: "Stats | None" = None):
        self.target = target
        self.stats = stats or Stats()
        self.lock = threading.Lock()
        self.cond = threading.Condition(self.lock)
        # Licznik zmian stanu. Klient podaje ostatnia widziana wartosc i serwer
        # przetrzymuje jego zadanie, dopoki nic sie nie zmieni - dzieki temu wynik
        # rywala pojawia sie w momencie, w ktorym rywal zrobi powtorzenie,
        # a nie przy najblizszym odpytaniu.
        self.version = 0
        self.players: dict[str, dict] = {}
        self.matches: dict[str, dict] = {}

    def _bump(self) -> None:
        self.version += 1
        self.cond.notify_all()

    def _unique_name(self) -> str:
        taken = {p["name"] for p in self.players.values()}
        for a in ANIMALS:
            if a not in taken:
                return a
        return f"Player {secrets.randbelow(900) + 100}"

    # --- pomocnicze (wywolywane juz pod zamkiem) ---

    def _drop_stale(self, now: float) -> None:
        stale = [pid for pid, p in self.players.items() if now - p["seen"] > PLAYER_TIMEOUT]
        for pid in stale:
            self._leave(pid, now)
            self.players.pop(pid, None)
        if stale:
            self._bump()

        # Zakonczone mecze trzymamy tylko tak dlugo, jak ktos na nie patrzy
        # (ekran wyniku). Bez tego publiczny widget zjadalby pamiec bez konca.
        watched = {p.get("match") for p in self.players.values()}
        for mid in [mid for mid, m in self.matches.items()
                    if m["state"] == "done" and mid not in watched
                    and now - (m.get("ended") or now) > MATCH_KEEP_S]:
            del self.matches[mid]

    def _team_of(self, m: dict, pid: str) -> int | None:
        for i, team in enumerate(m["teams"]):
            if pid in team:
                return i
        return None

    def _leave(self, pid: str, now: float) -> None:
        p = self.players.get(pid)
        if not p:
            return
        mid = p.get("match")
        p["match"] = None
        p["status"] = "idle"
        m = self.matches.get(mid) if mid else None
        if not m or m["state"] == "done":
            return
        # Ktos wyszedl w trakcie - jego druzyna zostaje w niepelnym skladzie,
        # wiec konczymy walkowerem na rzecz przeciwnikow.
        side = self._team_of(m, pid)
        self._finish(m, 1 - side if side is not None else 0, "walkover", now)

    def _finish(self, m: dict, winner: int, reason: str, now: float) -> None:
        """Konczy mecz i zapisuje wynik. Jedno miejsce, zeby zaden koniec nie umknal."""
        m["state"] = "done"
        m["winner"] = winner
        m["reason"] = reason
        m["ended"] = now
        if not m.get("recorded"):
            m["recorded"] = True
            side = lambda i: [(self._snap(m, x)["name"], self._snap(m, x)["count"])
                              for x in m["teams"][i]]
            self.stats.record(m["mode"], m.get("exercise", "pushup"),
                              side(winner), side(1 - winner))
        self._bump()

    def _pair(self, now: float) -> None:
        for (mode, size), exercise in ((m, e) for m in MODES.items() for e in EXERCISES):
            need = size * 2
            # Pompki i przysiady nie trafiaja do jednego meczu - wynik bylby bez sensu.
            waiting = sorted(
                (pid for pid, p in self.players.items()
                 if p["status"] == "queued" and p["mode"] == mode
                 and p.get("exercise", "pushup") == exercise),
                key=lambda pid: self.players[pid]["queued_at"],
            )
            while len(waiting) >= need:
                group = [waiting.pop(0) for _ in range(need)]
                teams = [group[0::2], group[1::2]]   # na przemian, zeby sklady byly rowne
                mid = secrets.token_hex(8)
                self.matches[mid] = {
                    "id": mid,
                    "mode": mode,
                    "exercise": exercise,
                    "teams": teams,
                    # Mecz pamieta nazwy i wyniki samodzielnie. Rekord gracza znika
                    # przy rozlaczeniu, a wtedy ekran wyniku pokazywalby "Opponent"
                    # i 0:0 zamiast tego, kto naprawde gral i z jakim wynikiem.
                    "snap": {pid: {"name": self.players[pid]["name"], "count": 0}
                             for pid in group},
                    "target": self.target,
                    "state": "countdown",
                    "starts": now + COUNTDOWN_S,
                    "winner": None,
                    "reason": None,
                    "ended": None,
                }
                for pid in group:
                    self.players[pid]["status"] = "racing"
                    self.players[pid]["match"] = mid
                    self.players[pid]["count"] = 0
                self._bump()

    def _snap(self, m: dict, pid: str) -> dict:
        return m.setdefault("snap", {}).setdefault(pid, {"name": "Player", "count": 0})

    def _score(self, m: dict, side: int) -> int:
        return sum(self._snap(m, x)["count"] for x in m["teams"][side])

    def _team_view(self, m: dict, side: int, me: str) -> dict:
        return {
            "score": self._score(m, side),
            "players": [
                {"name": self._snap(m, x)["name"], "count": self._snap(m, x)["count"],
                 "you": x == me, "gone": x not in self.players}
                for x in m["teams"][side]
            ],
        }

    def _view(self, pid: str, now: float) -> dict:
        p = self.players[pid]
        out = {
            "playerId": pid,
            "status": p["status"],
            "mode": p["mode"],
            "exercise": p.get("exercise", "pushup"),
            "target": self.target,
            "me": {"name": p["name"], "count": p["count"]},
            "teams": None,
            "match": None,
            "queueSize": sum(1 for q in self.players.values()
                             if q["status"] == "queued" and q["mode"] == p["mode"]
                             and q.get("exercise", "pushup") == p.get("exercise", "pushup")),
            "needed": MODES.get(p["mode"], 1) * 2,
            "online": len(self.players),
        }
        m = self.matches.get(p.get("match")) if p.get("match") else None
        if not m:
            return out
        side = self._team_of(m, pid) or 0
        # teams[0] to zawsze moja druzyna - klient nie musi sie domyslac, po ktorej stronie gra
        out["teams"] = [self._team_view(m, side, pid), self._team_view(m, 1 - side, pid)]
        out["match"] = {
            "id": m["id"],
            "mode": m["mode"],
            "exercise": m.get("exercise", "pushup"),
            "state": m["state"],
            "target": m["target"],
            "startsIn": max(0.0, round(m["starts"] - now, 2)),
            "winner": (("me" if m["winner"] == side else "them")
                       if m["winner"] is not None else None),
            "reason": m["reason"],
        }
        return out

    # --- API ---

    def queues(self) -> dict:
        """Ile osob czeka w kazdej kolejce - do podgladu na ekranie wyboru trybu."""
        with self.lock:
            self._drop_stale(time.time())
            waiting = {mode: {ex: 0 for ex in EXERCISES} for mode in MODES}
            playing = 0
            for p in self.players.values():
                if p["status"] == "queued" and p["mode"] in waiting:
                    ex = p.get("exercise", "pushup")
                    if ex in waiting[p["mode"]]:
                        waiting[p["mode"]][ex] += 1
                elif p["status"] == "racing":
                    playing += 1
            return {
                "waiting": waiting,
                "needed": {mode: size * 2 for mode, size in MODES.items()},
                "playing": playing,
                "online": len(self.players),
                "target": self.target,
            }

    def sync(self, pid: str | None, name: str, count: int,
             action: str | None, mode: str | None,
             wait: bool = False, since: int = -1, exercise: str | None = None) -> dict:
        now = time.time()
        with self.lock:
            self._drop_stale(now)

            if not pid or pid not in self.players:
                pid = secrets.token_hex(8)
                self.players[pid] = {
                    "name": name or self._unique_name(),
                    "count": 0,
                    "status": "idle",
                    "mode": mode if mode in MODES else "1v1",
                    "exercise": exercise if exercise in EXERCISES else "pushup",
                    "match": None,
                    "seen": now,
                    "queued_at": now,
                }
                self._bump()
            p = self.players[pid]
            p["seen"] = now
            if name and name != p["name"]:
                p["name"] = name
                mm = self.matches.get(p.get("match")) if p.get("match") else None
                if mm:
                    self._snap(mm, pid)["name"] = name
                self._bump()

            if action == "queue" and p["status"] == "idle":
                p["status"] = "queued"
                p["mode"] = mode if mode in MODES else "1v1"
                p["exercise"] = exercise if exercise in EXERCISES else "pushup"
                p["queued_at"] = now
                p["count"] = 0
                self._bump()
            elif action == "leave":
                self._leave(pid, now)
                self._bump()
            elif action == "quit":
                # The page is closing: leave any queue or match and stop counting as
                # online right away, instead of lingering until the timeout as a ghost
                # that could even be paired with a real player.
                self._leave(pid, now)
                self.players.pop(pid, None)
                self._bump()
                return {"playerId": None, "quit": True}

            m = self.matches.get(p.get("match")) if p.get("match") else None
            if m and m["state"] == "countdown" and now >= m["starts"]:
                m["state"] = "running"
                self._bump()
            if m and m["state"] == "running":
                # W trakcie pojedynku licznik tylko rosnie. Klient, ktory na chwile
                # straci polaczenie albo przeladuje strone, przysle 0 - bez tego
                # zabora skasowalby wklad gracza do wyniku druzyny.
                new_count = max(p["count"], int(count))
                if new_count != p["count"]:
                    p["count"] = new_count
                    self._snap(m, pid)["count"] = new_count
                    self._bump()
                for side in (0, 1):
                    if self._score(m, side) >= m["target"]:
                        self._finish(m, side, "target", now)
                        break

            self._pair(now)

            # Dlugie odpytywanie: jesli od ostatniej odpowiedzi nic sie nie zmienilo,
            # przytrzymujemy zadanie zamiast odsylac ten sam stan. Odliczanie zalezy
            # od zegara, a nie od zdarzen, wiec tam czekamy krotko.
            if wait and self.version == since:
                m = self.matches.get(p.get("match")) if p.get("match") else None
                cap = 0.2 if (m and m["state"] == "countdown") else 5.0
                deadline = time.time() + cap
                while self.version == since:
                    left = deadline - time.time()
                    if left <= 0:
                        break
                    self.cond.wait(left)
                now = time.time()
                m = self.matches.get(p.get("match")) if p.get("match") else None
                if m and m["state"] == "countdown" and now >= m["starts"]:
                    m["state"] = "running"
                    self._bump()

            view = self._view(pid, time.time())
            view["v"] = self.version
            return view


class DualStackServer(ThreadingHTTPServer):
    """Nasluch na IPv6 i IPv4 jednoczesnie.

    Na Windowsie "localhost" rozwiazuje sie najpierw na ::1. Serwer zwiazany tylko
    z 0.0.0.0 odrzuca to polaczenie, a klient dopiero po timeoucie probuje 127.0.0.1 -
    kosztowalo to ~2 s na zadanie zamiast ~1 ms, czyli przy odpytywaniu cztery razy
    na sekunde gra przestawala dzialac.
    """

    address_family = socket.AF_INET6
    daemon_threads = True

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        return super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    lobby: Lobby = None  # ustawiane w serve()
    protocol_version = "HTTP/1.1"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB_DIR), **kw)

    def log_message(self, fmt, *args):
        # log_error podaje tu HTTPStatus, nie tekst - stad rzutowanie. Bez niego
        # kazde 404 wywracalo watek obslugi polaczenia.
        if not any("/api/" in str(a) for a in args):
            super().log_message(fmt, *args)

    def end_headers(self):
        # Vendor to kilkanascie MB wasm i modeli, ktore nigdy sie nie zmieniaja.
        # Przez tunel drugi gracz ciagnie je z drugiego konca swiata, wiec musza
        # wpasc do cache przegladarki - inaczej kazde wejscie to minuta czekania.
        if self.path.startswith("/vendor/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Permissions-Policy", "camera=(self)")
        if self.path.startswith("/api/"):
            # Tabela wynikow jest czytana takze z innej strony (aplikacja CRW+),
            # takze przez publiczny adres Cloudflare.
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "86400")
        super().end_headers()

    def guess_type(self, path):
        p = str(path).lower()
        if p.endswith(".mjs") or p.endswith(".js"):
            return "text/javascript"
        if p.endswith(".wasm"):
            return "application/wasm"
        if p.endswith(".task"):
            return "application/octet-stream"
        return super().guess_type(path)

    def send_head(self):
        """Range header support - without it the browser will not play <video>."""
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or os.path.isdir(path):
            return super().send_head()

        m = re.match(r"bytes=(\d*)-(\d*)\s*$", rng.strip())
        if not m:
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        size = os.fstat(f.fileno()).st_size
        first, last = m.group(1), m.group(2)
        if first:
            start = int(first)
            end = int(last) if last else size - 1
        else:                      # postac "bytes=-N" - ostatnie N bajtow
            start = max(0, size - int(last or 0))
            end = size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        f.seek(start)
        chunk = io.BytesIO(f.read(end - start + 1))
        f.close()
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return chunk

    def _json(self, obj, code: int = 200) -> None:
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_error(405)

    def do_GET(self):
        url = self.path.split("?", 1)
        path, query = url[0], (url[1] if len(url) > 1 else "")
        if path == "/api/queues":
            self._json(self.lobby.queues())
            return
        if path in ("/api/stats", "/api/leaderboard"):
            q = parse_qs(query)
            if path == "/api/stats":
                self._json(self.lobby.stats.of((q.get("name") or [""])[0]))
            else:
                try:
                    limit = int((q.get("limit") or ["3"])[0])
                except ValueError:
                    limit = 3
                self._json({"top": self.lobby.stats.top(limit)})
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/sync":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(n) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self.send_error(400, "bad JSON")
            return
        view = self.lobby.sync(
            body.get("playerId"),
            str(body.get("name", ""))[:24],
            body.get("count", 0),
            body.get("action"),
            body.get("mode"),
            bool(body.get("wait")),
            int(body.get("since", -1)),
            body.get("exercise"),
        )
        self._json(view)


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_cert(ip: str) -> tuple[Path, Path]:
    """Self-signed cert with a SAN for the LAN IP. Without HTTPS the browser gives
    the camera to nobody except localhost."""
    CERT_DIR.mkdir(exist_ok=True)
    cert, key = CERT_DIR / "server.crt", CERT_DIR / "server.key"
    if cert.exists() and key.exists():
        return cert, key
    print("Generating a self-signed certificate...", file=sys.stderr)
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
         "-keyout", str(key), "-out", str(cert), "-days", "365",
         "-subj", "/CN=pushups",
         "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost"],
        check=True, capture_output=True,
    )
    return cert, key


def serve(port: int = 8000, target: int = 20, https: bool = False,
          tunnel: bool = False, hostname: str | None = None,
          force_dns: bool = False) -> None:
    Handler.lobby = Lobby(target=target)
    try:
        httpd = DualStackServer(("::", port), Handler)
    except OSError:                       # system bez IPv6
        httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    ip = lan_ip()
    scheme = "http"
    if https:
        cert, key = ensure_cert(ip)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"

    tun = None
    public = None
    if tunnel:
        from .tunnel import Tunnel

        tun = Tunnel(port, hostname=hostname, force_dns=force_dns)
        print("Starting Cloudflare tunnel...", flush=True)
        try:
            public = tun.start()
        except RuntimeError as e:
            httpd.server_close()
            print(f"\n{e}\n", file=sys.stderr)
            raise SystemExit(1)

    print()
    print(f"  Push-up counter - race to {target}")
    if public:
        print(f"  Address   : {public}")
        print("  Works from any network and has a valid HTTPS certificate,")
        print("  so the camera will not be blocked.")
    else:
        print(f"  You       : {scheme}://localhost:{port}")
        print(f"  Others    : {scheme}://{ip}:{port}")
        if https:
            print("  (the browser will warn about the certificate - Advanced -> Proceed)")
        else:
            print("  NOTE: over plain http the camera only works on localhost. For anyone")
            print("        else, start with --tunnel or --https.")
    if public:
        print("  Anyone who opens this address can join a queue.")
    print("  Ctrl+C stops it.")
    print(flush=True)   # adres musi byc widoczny od razu, takze przy przekierowaniu
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()
        if tun:
            tun.stop()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        prog="pushups.server",
        description="Web version: push-up and squat counter with solo, 1v1 and 2v2 modes.",
    )
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--target", type=int, default=20, help="reps needed to win (team total in 2v2)")
    p.add_argument("--https", action="store_true",
                   help="HTTPS with a self-signed certificate (alternative to --tunnel)")
    p.add_argument("--tunnel", action="store_true",
                   help="expose through a Cloudflare tunnel - public address with valid HTTPS")
    p.add_argument("--hostname", metavar="DOMAIN",
                   help="your own domain for the tunnel, e.g. pushups.example.com "
                        "(needs a one-off 'cloudflared tunnel login')")
    p.add_argument("--force-dns", action="store_true",
                   help="allow replacing an existing DNS record at --hostname")
    a = p.parse_args(argv)
    if a.hostname and not a.tunnel:
        a.tunnel = True          # --hostname nie ma sensu bez tunelu
    if a.tunnel and a.https:
        print("--tunnel already provides HTTPS, ignoring --https.", file=sys.stderr)
        a.https = False
    if not WEB_DIR.exists():
        print(f"Missing directory {WEB_DIR}", file=sys.stderr)
        return 1
    serve(port=a.port, target=a.target, https=a.https,
          tunnel=a.tunnel, hostname=a.hostname, force_dns=a.force_dns)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
