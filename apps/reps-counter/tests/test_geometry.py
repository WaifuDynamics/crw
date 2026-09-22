"""Testy bramkowania widocznosci - lekcja z realnego, ciasno kadrowanego nagrania."""
from dataclasses import dataclass

from pushups.geometry import (
    L_ANKLE,
    L_ELBOW,
    L_HIP,
    L_KNEE,
    L_SHOULDER,
    L_WRIST,
    R_ANKLE,
    R_ELBOW,
    R_HIP,
    R_KNEE,
    R_SHOULDER,
    R_WRIST,
    Landmarks,
    key_visibility,
)


@dataclass
class LM:
    x: float
    y: float
    z: float = 0.0
    visibility: float = 0.9
    presence: float = 0.9


def make(overrides=None):
    """33 landmarki gdzies w srodku kadru, z opcjonalnymi nadpisaniami."""
    pts = [LM(0.5, 0.5) for _ in range(33)]
    for idx, lm in (overrides or {}).items():
        pts[idx] = lm
    return Landmarks(pts, 1920, 1080)


def test_landmark_just_outside_frame_still_counts():
    """Przy ciasnym kadrze dlonie schodza kilka procent ponizej dolu obrazu.
    Ekstrapolacja MediaPipe jest tam sensowna - odrzucanie jej gubilo powtorzenia."""
    lm = make({L_WRIST: LM(0.5, 1.06)})
    assert lm.vis(L_WRIST) > 0.5


def test_landmark_far_outside_frame_is_discarded():
    """Kostki wyjezdzaly w nagraniu do x = -0.6 z pewnoscia 0.57 - to zgadywanie."""
    lm = make({L_ANKLE: LM(-0.6, 0.45, visibility=0.57, presence=0.57)})
    assert lm.vis(L_ANKLE) == 0.0


def test_key_visibility_ignores_hips():
    """Do kata w lokciu biodra nie sa potrzebne; wymaganie ich blokowalo liczenie."""
    lm = make({L_HIP: LM(0.5, 0.5, visibility=0.0, presence=0.0),
               R_HIP: LM(0.5, 0.5, visibility=0.0, presence=0.0)})
    assert key_visibility(lm) > 0.5


def test_key_visibility_needs_one_complete_arm():
    """Jedna zaslonieta reka to za malo, druga kompletna wystarczy."""
    hidden = {i: LM(0.5, 0.5, visibility=0.0, presence=0.0) for i in (L_ELBOW,)}
    assert key_visibility(make(hidden)) > 0.5
    hidden.update({i: LM(0.5, 0.5, visibility=0.0, presence=0.0) for i in (R_ELBOW,)})
    assert key_visibility(make(hidden)) == 0.0


def test_straightness_is_none_when_legs_out_of_frame():
    """Lepiej nie oceniac techniki wcale niz oceniac ja po zgadnietych punktach."""
    out = LM(-0.6, 0.45, visibility=0.57, presence=0.57)
    lm = make({L_ANKLE: out, R_ANKLE: out, L_KNEE: out, R_KNEE: out})
    assert lm.straightness() is None


def test_straightness_falls_back_to_knees():
    lm = make({
        L_ANKLE: LM(-0.6, 0.45), R_ANKLE: LM(-0.6, 0.45),
        L_SHOULDER: LM(0.7, 0.4), L_HIP: LM(0.45, 0.5), L_KNEE: LM(0.2, 0.6),
    })
    s = lm.straightness()
    assert s is not None and 150 < s <= 180


def test_elbow_angle_uses_visible_arm_only():
    lm = make({
        L_SHOULDER: LM(0.7, 0.4), L_ELBOW: LM(0.5, 0.5), L_WRIST: LM(0.5, 0.8),
        R_SHOULDER: LM(-0.9, 0.4), R_ELBOW: LM(-0.9, 0.5), R_WRIST: LM(-0.9, 0.8),
    })
    a = lm.elbow_angle()
    assert a is not None and 0 < a < 180


def test_knee_angle_standing_and_bent():
    standing = make({L_HIP: LM(0.5, 0.3), L_KNEE: LM(0.5, 0.5), L_ANKLE: LM(0.5, 0.7)})
    bent = make({L_HIP: LM(0.3, 0.5), L_KNEE: LM(0.5, 0.5), L_ANKLE: LM(0.5, 0.7)})
    assert standing.knee_angle() > 175
    assert abs(bent.knee_angle() - 90) < 1


def test_squat_needs_a_leg_pushup_needs_an_arm():
    no_knees = make({L_KNEE: LM(0.5, 0.5, visibility=0.0, presence=0.0),
                     R_KNEE: LM(0.5, 0.5, visibility=0.0, presence=0.0)})
    assert key_visibility(no_knees) > 0.5              # pompki: ramiona widac
    assert key_visibility(no_knees, "squat") == 0.0    # przysiad: bez kolan nie liczymy

    no_elbows = make({L_ELBOW: LM(0.5, 0.5, visibility=0.0, presence=0.0),
                      R_ELBOW: LM(0.5, 0.5, visibility=0.0, presence=0.0)})
    assert key_visibility(no_elbows, "squat") > 0.5
    assert key_visibility(no_elbows) == 0.0


def test_squat_ignores_ankle_at_frame_edge():
    """Nagranie pompek: kostka na krawedzi kadru z widocznoscia ~0.5. Przy progu 0.4
    zaszumiony kat w kolanie dawal falszywe przysiady."""
    from pushups.exercises import EXERCISES
    ex = EXERCISES["squat"]
    edge = LM(0.03, 0.6, visibility=0.5, presence=0.5)
    lm = make({L_ANKLE: edge, R_ANKLE: edge})
    assert key_visibility(lm, "squat") < ex.min_visibility
    assert lm.knee_angle(ex.min_visibility) is None
    assert key_visibility(lm) >= EXERCISES["pushup"].min_visibility   # pompki bez zmian
