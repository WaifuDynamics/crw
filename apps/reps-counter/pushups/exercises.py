"""Definicje cwiczen: ktory staw liczymy i od jakich progow startuje kalibracja."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Exercise:
    id: str
    label: str
    joint: str          # "elbow" (bark-lokiec-nadgarstek) | "knee" (biodro-kolano-kostka)
    up: float           # prog 'gora' zanim auto-kalibracja zbierze zakres ruchu
    down: float         # prog 'dol'
    form_check: bool    # czy ocena sylwetki bark-biodro-kostka ma tu sens
    # Minimalna widocznosc stawow potrzebnych do liczenia. Przy pompkach wystarczy
    # 0.4. Przy przysiadach kostka na krawedzi kadru dostaje ~0.4-0.6 i zaszumiony
    # kat w kolanie robil falszywe powtorzenia - wyraznie widoczne nogi maja ~0.9.
    min_visibility: float = 0.4


EXERCISES: dict[str, Exercise] = {
    # Wyprostowane rece ~170, dol pompki ~80-90.
    "pushup": Exercise("pushup", "Push-ups", "elbow", 155.0, 100.0, True),
    # Stojac kolano ~175, przysiad do rownoleglej ~90-100. Prog 'dol' jest luzniejszy
    # niz przy pompkach, bo mniej osob schodzi gleboko - reszte i tak dostroi kalibracja.
    # Linia bark-biodro-kostka w przysiadzie z natury sie lamie, wiec jej nie oceniamy.
    "squat": Exercise("squat", "Squats", "knee", 160.0, 110.0, False, min_visibility=0.7),
}
DEFAULT_EXERCISE = "pushup"
