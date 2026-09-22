"""Maszyna stanow liczaca pompki. Czysta logika - bez OpenCV, bez MediaPipe."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, asdict
from typing import Optional

# Progi domyslne (stopnie w lokciu)
DEFAULT_UP = 155.0     # ramiona wyprostowane
DEFAULT_DOWN = 100.0   # dol pompki
MIN_RANGE = 35.0       # minimalny zakres ruchu, zeby uznac powtorzenie
REFERENCE_FPS = 30.0   # przy tej czestotliwosci parametry maja swoje nominalne znaczenie


@dataclass
class Rep:
    index: int
    t_start: float
    t_bottom: float
    t_end: float
    min_angle: float
    max_angle: float
    min_depth: Optional[float]
    min_straightness: Optional[float]

    @property
    def duration(self) -> float:
        return self.t_end - self.t_start

    @property
    def rom(self) -> float:
        """Zakres ruchu w stopniach."""
        return self.max_angle - self.min_angle

    @property
    def good_form(self) -> bool:
        return self.min_straightness is None or self.min_straightness >= 150.0

    def to_dict(self) -> dict:
        d = asdict(self)
        d["duration"] = round(self.duration, 3)
        d["rom"] = round(self.rom, 1)
        d["good_form"] = self.good_form
        return d


class AdaptiveThresholds:
    """Dostraja progi do faktycznego zakresu ruchu danej osoby.

    Nie kazdy prostuje rece do 175 stopni i nie kazdy schodzi do 80 - sztywne progi
    gubia wtedy powtorzenia. Bierzemy wiec 5. i 95. percentyl katow z ostatnich
    kilkunastu sekund (percentyle, a nie min/max, zeby pojedynczy blad wykrycia
    landmarka nie rozjechal progow) i ustawiamy progi na 30% / 70% tego zakresu.
    Zanim uzbiera sie sensowny zakres, dzialaja progi stale.
    """

    def __init__(
        self,
        up: float = DEFAULT_UP,
        down: float = DEFAULT_DOWN,
        enabled: bool = True,
        window_s: float = 20.0,
    ):
        self.fixed_up = up
        self.fixed_down = down
        self.enabled = enabled
        self.window_s = window_s
        self._samples: deque[tuple[float, float]] = deque()
        self.lo: Optional[float] = None
        self.hi: Optional[float] = None
        self._dirty = 0

    def observe(self, angle: float, t: float) -> None:
        self._samples.append((t, angle))
        cutoff = t - self.window_s
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()
        # percentyle przeliczamy co kilka klatek - i tak nie zmieniaja sie z klatki na klatke
        self._dirty += 1
        if self._dirty >= 5 or self.lo is None:
            self._dirty = 0
            self._recompute()

    def _recompute(self) -> None:
        if len(self._samples) < 10:
            return
        vals = sorted(a for _, a in self._samples)
        n = len(vals)
        self.lo = vals[max(0, int(0.05 * n))]
        self.hi = vals[min(n - 1, int(0.95 * n))]

    @property
    def calibrated(self) -> bool:
        return (
            self.enabled
            and self.lo is not None
            and self.hi is not None
            and (self.hi - self.lo) >= MIN_RANGE
        )

    @property
    def down(self) -> float:
        if self.calibrated:
            return self.lo + 0.30 * (self.hi - self.lo)
        return self.fixed_down

    @property
    def up(self) -> float:
        if self.calibrated:
            return self.lo + 0.70 * (self.hi - self.lo)
        return self.fixed_up


class PushupCounter:
    """Liczy powtorzenia na podstawie kata w lokciu w czasie.

    Powtorzenie = przejscie GORA -> DOL -> GORA o wystarczajacym zakresie
    i sensownym czasie trwania.
    """

    def __init__(
        self,
        up_threshold: float = DEFAULT_UP,
        down_threshold: float = DEFAULT_DOWN,
        adaptive: bool = True,
        smoothing: float = 0.5,
        min_rep_s: float = 0.35,
        max_rep_s: float = 15.0,
        min_rom: float = MIN_RANGE,
        confirm_frames: int = 2,
    ):
        self.th = AdaptiveThresholds(up_threshold, down_threshold, adaptive)
        self.smoothing = max(0.0, min(1.0, smoothing))
        self.min_rep_s = min_rep_s
        self.max_rep_s = max_rep_s
        self.min_rom = min_rom
        # Ile kolejnych klatek musi potwierdzic GORNA pozycje. Wykrywanie pozy raz na
        # kilkadziesiat klatek strzela wartoscia zupelnie obok (np. 179 w srodku dolu
        # pompki) - taki artefakt zamknalby powtorzenie w zlym miejscu. Potwierdzenie
        # stosujemy tylko na gorze, bo tam sylwetka stoi kilka klatek. Dno przy 30 fps
        # i tempie ~1 s trwa czesto jedna klatke, wiec tam kazde opoznienie gubi
        # powtorzenia - i z tego samego powodu odpada filtrowanie samego sygnalu.
        self.confirm_frames = max(1, confirm_frames)

        self.reps: list[Rep] = []
        self.state = "unknown"               # unknown | up | down
        self.angle: Optional[float] = None   # wygladzony kat
        self.raw_angle: Optional[float] = None
        self.depth: Optional[float] = None
        self.straightness: Optional[float] = None
        self.last_seen_t: Optional[float] = None
        self._dt = 1.0 / REFERENCE_FPS
        self._up_streak = 0
        self._down_streak = 0

        self._reset_rep()

    # --- API ---

    @property
    def count(self) -> int:
        return len(self.reps)

    @property
    def progress(self) -> float:
        """0.0 = gora, 1.0 = pelny dol. Do paska postepu na obrazie."""
        if self.angle is None:
            return 0.0
        up, down = self.th.up, self.th.down
        if up <= down:
            return 0.0
        return max(0.0, min(1.0, (up - self.angle) / (up - down)))

    def reset(self) -> None:
        self.reps.clear()
        self.state = "unknown"
        self.angle = None
        self._up_streak = 0
        self._down_streak = 0
        self._reset_rep()

    def lost_person(self, t: float) -> None:
        """Wywolywane, gdy w klatce nie ma wiarygodnej sylwetki.

        Licznika nie kasujemy - osoba mogla na chwile wyjsc poza kadr.
        """
        self.raw_angle = None

    def update(
        self,
        angle: Optional[float],
        t: float,
        depth: Optional[float] = None,
        straightness: Optional[float] = None,
    ) -> Optional[Rep]:
        """Podaj kat lokcia dla klatki w czasie t (sekundy).

        Zwraca Rep w momencie zaliczenia powtorzenia, inaczej None.
        """
        self.raw_angle = angle
        if angle is None:
            return None

        # Odstep od poprzedniej probki. Detekcja nie zawsze idzie 30 kl./s - na slabym
        # telefonie albo bez GPU to bywa 4-6 kl./s - wiec wygladzanie i potwierdzanie
        # musza liczyc sie w czasie, a nie w klatkach.
        prev_t = self.last_seen_t
        dt = 1.0 / REFERENCE_FPS if prev_t is None else min(1.0, max(0.0, t - prev_t))
        self._dt = dt
        self.last_seen_t = t
        self.depth = depth
        self.straightness = straightness

        # Wygladzanie EMA. `smoothing` to waga poprzedniej wartosci przy 30 kl./s;
        # przy rzadszych probkach waga maleje wykladniczo, bo poprzednia wartosc
        # jest starsza. Przy 4 kl./s stala waga 0.5 splaszczala caly ruch i licznik
        # gubil wiekszosc powtorzen.
        if self.angle is None:
            self.angle = angle
        else:
            w = self.smoothing ** (dt * REFERENCE_FPS)
            self.angle = (1.0 - w) * angle + w * self.angle

        sm = self.angle
        # Zakres ruchu mierzymy na surowym kacie: EMA sciaga amplitude i zanizalaby
        # zarowno auto-kalibracje progow, jak i zapisany zakres powtorzenia.
        self.th.observe(angle, t)

        if angle < self._min_angle:
            self._min_angle = angle
            if self.state == "down":
                self._t_bottom = t   # najnizszy punkt tego powtorzenia
        self._max_angle = max(self._max_angle, angle)
        if depth is not None:
            self._min_depth = depth if self._min_depth is None else min(self._min_depth, depth)
        if straightness is not None:
            self._min_straight = (
                straightness if self._min_straight is None else min(self._min_straight, straightness)
            )

        up, down = self.th.up, self.th.down
        self._up_streak = self._up_streak + 1 if sm >= up else 0
        self._down_streak = self._down_streak + 1 if sm <= down else 0
        # Potwierdzenie gornej pozycji ma odsiac jednoklatkowy artefakt detekcji.
        # Gdy probki przychodza rzadziej niz co dwie klatki 30 kl./s, jedna probka
        # obejmuje juz tyle czasu co dwie - inaczej gora (~0.3 s) przy 4 kl./s nigdy
        # by sie nie potwierdzila.
        at_top = self._up_streak >= self.confirm_frames or (
            self._up_streak >= 1 and self._dt >= (self.confirm_frames / REFERENCE_FPS)
        )
        at_bottom = self._down_streak >= 1

        if self.state == "unknown":
            if at_top:
                self.state = "up"
                self._start_rep(t)
            return None

        if self.state == "up":
            if at_bottom:
                self.state = "down"
                self._t_bottom = t
                self._min_angle = angle
                self._min_depth = depth
                self._min_straight = straightness
            elif at_top:
                # wciaz w gornej pozycji (takze podczas odpoczynku miedzy seriami) -
                # przesuwamy start, zeby przerwa nie liczyla sie jako czas powtorzenia.
                # Ponizej progu 'gora' ruch juz trwa, wiec start zostaje zamrozony.
                self._t_up_start = t
                self._min_angle = angle
                # maksimum zostaje - to szczyt tego powtorzenia, potrzebny do zakresu ruchu
                self._max_angle = max(self._max_angle, angle)
            return None

        # self.state == "down"
        if at_top:
            rep = self._finish_rep(t)
            self.state = "up"
            self._start_rep(t)
            return rep
        return None

    # --- wewnetrzne ---

    def _start_rep(self, t: float) -> None:
        self._t_up_start = t
        self._t_bottom = None
        self._min_angle = self.raw_angle if self.raw_angle is not None else 180.0
        self._max_angle = self.raw_angle if self.raw_angle is not None else 0.0
        self._min_depth = None
        self._min_straight = None

    def _reset_rep(self) -> None:
        self._t_up_start: Optional[float] = None
        self._t_bottom: Optional[float] = None
        self._min_angle = 180.0
        self._max_angle = 0.0
        self._min_depth: Optional[float] = None
        self._min_straight: Optional[float] = None

    def _finish_rep(self, t: float) -> Optional[Rep]:
        t0 = self._t_up_start if self._t_up_start is not None else t
        dur = t - t0
        rom = self._max_angle - self._min_angle
        if dur < self.min_rep_s or dur > self.max_rep_s or rom < self.min_rom:
            return None
        rep = Rep(
            index=len(self.reps) + 1,
            t_start=t0,
            t_bottom=self._t_bottom if self._t_bottom is not None else t0,
            t_end=t,
            min_angle=self._min_angle,
            max_angle=self._max_angle,
            min_depth=self._min_depth,
            min_straightness=self._min_straight,
        )
        self.reps.append(rep)
        return rep

    # --- podsumowanie ---

    def summary(self) -> dict:
        reps = self.reps
        durs = [r.duration for r in reps]
        gaps = [b.t_end - a.t_end for a, b in zip(reps, reps[1:])]
        return {
            "count": len(reps),
            "avg_rep_s": round(sum(durs) / len(durs), 2) if durs else None,
            "avg_cadence_s": round(sum(gaps) / len(gaps), 2) if gaps else None,
            "fastest_rep_s": round(min(durs), 2) if durs else None,
            "slowest_rep_s": round(max(durs), 2) if durs else None,
            "avg_rom_deg": round(sum(r.rom for r in reps) / len(reps), 1) if reps else None,
            # Rozrozniamy "sylwetka byla poprawna" od "nie bylo jak ocenic" - przy
            # ciasnym kadrze nogi sa poza obrazem i ocena techniki jest niemozliwa.
            "form_checked_reps": sum(1 for r in reps if r.min_straightness is not None),
            "good_form_reps": sum(1 for r in reps
                                  if r.min_straightness is not None and r.good_form),
            "thresholds": {
                "up": round(self.th.up, 1),
                "down": round(self.th.down, 1),
                "adaptive": self.th.calibrated,
            },
            "reps": [r.to_dict() for r in reps],
        }
