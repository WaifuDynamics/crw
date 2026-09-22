"""Obliczenia geometryczne na punktach szkieletu (landmarkach)."""
from __future__ import annotations

import math
from typing import Optional, Sequence

# Indeksy landmarkow MediaPipe Pose (33 punkty)
NOSE = 0
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28

Point = tuple[float, float]

# Jak daleko poza kadr (w ulamku wymiaru obrazu) ekstrapolacja pozy jest jeszcze
# wiarygodna. Kostki wyjezdzaja tu nawet do x = -0.6, dlonie ledwie o kilka procent.
OUTSIDE_MARGIN = 0.15


def angle_deg(a: Point, b: Point, c: Point) -> float:
    """Kat ABC w stopniach (b to wierzcholek)."""
    bax, bay = a[0] - b[0], a[1] - b[1]
    bcx, bcy = c[0] - b[0], c[1] - b[1]
    na = math.hypot(bax, bay)
    nc = math.hypot(bcx, bcy)
    if na < 1e-9 or nc < 1e-9:
        return float("nan")
    cos = (bax * bcx + bay * bcy) / (na * nc)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


class Landmarks:
    """Landmarki jednej klatki, przeskalowane do pikseli (kat nie zalezy od proporcji obrazu)."""

    def __init__(self, raw: Sequence, width: int, height: int):
        self._raw = raw
        self._w = width
        self._h = height

    def __len__(self) -> int:
        return len(self._raw)

    def xy(self, idx: int) -> Point:
        lm = self._raw[idx]
        return (lm.x * self._w, lm.y * self._h)

    def px(self, idx: int) -> tuple[int, int]:
        x, y = self.xy(idx)
        return (int(round(x)), int(round(y)))

    def in_frame(self, idx: int, margin: float = 0.0) -> bool:
        lm = self._raw[idx]
        return -margin <= lm.x <= 1.0 + margin and -margin <= lm.y <= 1.0 + margin

    def vis(self, idx: int, margin: float = OUTSIDE_MARGIN) -> float:
        """Widocznosc punktu, z zerowaniem punktow zmyslonych daleko poza kadrem.

        MediaPipe ekstrapoluje stawy poza obraz i potrafi dac im przyzwoita pewnosc.
        Tuz za krawedzia ta ekstrapolacja jest zwykle sensowna (przy ciasnym kadrze
        dlonie schodza kilka procent ponizej dolu obrazu) - daleko poza kadrem to juz
        zgadywanie i takie punkty odrzucamy.
        """
        if not self.in_frame(idx, margin):
            return 0.0
        lm = self._raw[idx]
        v = getattr(lm, "visibility", None)
        p = getattr(lm, "presence", None)
        vals = [x for x in (v, p) if x is not None]
        return min(vals) if vals else 1.0

    # --- miary uzywane przez licznik ---

    def elbow_angle(self, min_vis: float = 0.3) -> Optional[float]:
        """Sredni kat w lokciach; jesli widac tylko jedna reke - kat tej reki."""
        angles = []
        for sh, el, wr in ((L_SHOULDER, L_ELBOW, L_WRIST), (R_SHOULDER, R_ELBOW, R_WRIST)):
            if min(self.vis(sh), self.vis(el), self.vis(wr)) < min_vis:
                continue
            a = angle_deg(self.xy(sh), self.xy(el), self.xy(wr))
            if not math.isnan(a):
                angles.append(a)
        if not angles:
            return None
        return sum(angles) / len(angles)

    def knee_angle(self, min_vis: float = 0.3) -> Optional[float]:
        """Sredni kat w kolanach (biodro-kolano-kostka); przy jednej widocznej nodze - jej kat."""
        angles = []
        for hip, knee, ank in ((L_HIP, L_KNEE, L_ANKLE), (R_HIP, R_KNEE, R_ANKLE)):
            if min(self.vis(hip), self.vis(knee), self.vis(ank)) < min_vis:
                continue
            a = angle_deg(self.xy(hip), self.xy(knee), self.xy(ank))
            if not math.isnan(a):
                angles.append(a)
        if not angles:
            return None
        return sum(angles) / len(angles)

    def straightness(self, min_vis: float = 0.6) -> Optional[float]:
        """Kat bark-biodro-kostka (lub bark-biodro-kolano, gdy kostki nie widac).

        ~180 = proste cialo, mniej = zapadniete albo zgiete biodra. Zwraca None,
        gdy dolna czesc ciala jest poza kadrem - lepiej nie oceniac sylwetki wcale
        niz oceniac ja po zgadnietych punktach. Prog widocznosci jest tu wyzszy niz
        przy liczeniu powtorzen, bo to ocena doradcza, a nie sam licznik.
        """
        for lower_l, lower_r in ((L_ANKLE, R_ANKLE), (L_KNEE, R_KNEE)):
            angles = []
            for sh, hip, low in ((L_SHOULDER, L_HIP, lower_l), (R_SHOULDER, R_HIP, lower_r)):
                if min(self.vis(sh, 0.0), self.vis(hip, 0.0), self.vis(low, 0.0)) < min_vis:
                    continue
                a = angle_deg(self.xy(sh), self.xy(hip), self.xy(low))
                if not math.isnan(a):
                    angles.append(a)
            if angles:
                return sum(angles) / len(angles)
        return None

    def torso_len(self) -> float:
        sx = (self.xy(L_SHOULDER)[0] + self.xy(R_SHOULDER)[0]) / 2
        sy = (self.xy(L_SHOULDER)[1] + self.xy(R_SHOULDER)[1]) / 2
        hx = (self.xy(L_HIP)[0] + self.xy(R_HIP)[0]) / 2
        hy = (self.xy(L_HIP)[1] + self.xy(R_HIP)[1]) / 2
        return math.hypot(sx - hx, sy - hy)

    def depth_ratio(self) -> Optional[float]:
        """Jak nisko schodzi klatka piersiowa: dystans bark-nadgarstek / dlugosc tulowia.
        Male wartosci = bark blisko poziomu dloni = gleboka pompka."""
        t = self.torso_len()
        if t < 1e-6:
            return None
        d = []
        for sh, wr in ((L_SHOULDER, L_WRIST), (R_SHOULDER, R_WRIST)):
            if min(self.vis(sh), self.vis(wr)) < 0.3:
                continue
            d.append(math.dist(self.xy(sh), self.xy(wr)))
        if not d:
            return None
        return (sum(d) / len(d)) / t


def key_visibility(lm: Landmarks, exercise: str = "pushup") -> float:
    """Pewnosc, ze widac to, czego potrzebuje licznik danego cwiczenia.

    Pompki: jedno kompletne ramie. Biodra i nogi celowo sie nie licza - przy ciasnym
    kadrze czesto ich nie widac, a do kata w lokciu nie sa potrzebne.
    Przysiady: jedna kompletna noga. Bez kostki kat w kolanie bylby zgadywany.
    """
    if exercise == "squat":
        left = min(lm.vis(i) for i in (L_HIP, L_KNEE, L_ANKLE))
        right = min(lm.vis(i) for i in (R_HIP, R_KNEE, R_ANKLE))
    else:
        left = min(lm.vis(i) for i in (L_SHOULDER, L_ELBOW, L_WRIST))
        right = min(lm.vis(i) for i in (R_SHOULDER, R_ELBOW, R_WRIST))
    return max(left, right)
