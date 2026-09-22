"""Testy lobby: nazwy, zapis meczu po rozlaczeniu, dlugie odpytywanie."""
import threading
import time

from pushups import server
from pushups.server import Lobby


def start(lobby, *names, mode="1v1"):
    ids = [lobby.sync(None, n, 0, "queue", mode)["playerId"] for n in names]
    for m in lobby.matches.values():
        m["starts"] = 0          # bez czekania na odliczanie
    for i in ids:
        lobby.sync(i, "", 0, None, mode)
    return ids


def test_empty_names_get_distinct_names():
    lobby = Lobby(target=10)
    a, b = start(lobby, "", "")
    v = lobby.sync(a, "", 0, None, "1v1")
    me = v["me"]["name"]
    them = v["teams"][1]["players"][0]["name"]
    assert me != them
    assert "Player" not in (me, them)


def test_opponent_name_and_score_survive_leaving():
    lobby = Lobby(target=10)
    a, b = start(lobby, "Michal", "Rival")
    lobby.sync(a, "", 3, None, "1v1")
    lobby.sync(b, "", 7, None, "1v1")
    lobby.sync(b, "", 7, "leave", "1v1")

    v = lobby.sync(a, "", 3, None, "1v1")
    opp = v["teams"][1]["players"][0]
    assert opp["name"] == "Rival"
    assert opp["count"] == 7
    assert (v["teams"][0]["score"], v["teams"][1]["score"]) == (3, 7)
    assert v["match"]["reason"] == "walkover"


def test_opponent_marked_gone_after_timeout(monkeypatch):
    lobby = Lobby(target=10)
    a, b = start(lobby, "Ala", "Bob")
    lobby.sync(b, "", 6, None, "1v1")
    lobby.players[b]["seen"] -= server.PLAYER_TIMEOUT + 1

    opp = lobby.sync(a, "", 2, None, "1v1")["teams"][1]["players"][0]
    assert opp == {"name": "Bob", "count": 6, "you": False, "gone": True}


def test_score_never_drops_during_match():
    lobby = Lobby(target=20)
    a, b = start(lobby, "A", "B")
    lobby.sync(a, "", 5, None, "1v1")
    v = lobby.sync(a, "", 0, None, "1v1")     # np. po przeladowaniu strony
    assert v["teams"][0]["score"] == 5


def test_two_v_two_sums_team():
    lobby = Lobby(target=50)
    ids = start(lobby, "A", "B", "C", "D", mode="2v2")
    for i, n in zip(ids, (4, 2, 3, 1)):
        lobby.sync(i, "", n, None, "2v2")
    v = lobby.sync(ids[0], "", 4, None, "2v2")
    assert v["teams"][0]["score"] == 7          # A + C (sklady na przemian)
    assert v["teams"][1]["score"] == 3


def test_long_poll_wakes_on_opponent_rep():
    lobby = Lobby(target=20)
    a, b = start(lobby, "A", "B")
    v0 = lobby.sync(a, "", 0, None, "1v1")

    got = {}

    def waiter():
        t = time.time()
        v = lobby.sync(a, "", 0, None, "1v1", wait=True, since=v0["v"])
        got["dt"] = time.time() - t
        got["opp"] = v["teams"][1]["score"]

    th = threading.Thread(target=waiter)
    th.start()
    time.sleep(0.2)
    lobby.sync(b, "", 4, None, "1v1")
    th.join(3)

    assert got["opp"] == 4
    assert got["dt"] < 1.0                      # obudzony zmiana, nie timeoutem


def test_long_poll_holds_when_nothing_changes(monkeypatch):
    lobby = Lobby(target=20)
    a, _ = start(lobby, "A", "B")
    v0 = lobby.sync(a, "", 0, None, "1v1")
    t = time.time()
    lobby.sync(a, "", 0, None, "1v1", wait=True, since=v0["v"])
    assert time.time() - t >= 4.5


def test_finished_matches_are_pruned_once_nobody_watches():
    lobby = Lobby(target=5)
    a, b = start(lobby, "A", "B")
    lobby.sync(a, "", 5, None, "1v1")                # A wins
    mid = next(iter(lobby.matches))
    assert lobby.matches[mid]["state"] == "done"

    # still on the result screen - the match must stay
    lobby.matches[mid]["ended"] -= server.MATCH_KEEP_S + 1
    lobby.sync(a, "", 5, None, "1v1")
    assert mid in lobby.matches

    # both players moved on
    lobby.sync(a, "", 0, "leave", "1v1")
    lobby.sync(b, "", 0, "leave", "1v1")
    lobby.sync(a, "", 0, None, "1v1")
    assert mid not in lobby.matches


def test_exercises_have_separate_queues():
    lobby = Lobby(target=10)
    a = lobby.sync(None, "A", 0, "queue", "1v1", exercise="pushup")["playerId"]
    b = lobby.sync(None, "B", 0, "queue", "1v1", exercise="squat")["playerId"]
    assert not lobby.matches                 # pompki nie trafiaja na przysiady

    c = lobby.sync(None, "C", 0, "queue", "1v1", exercise="squat")["playerId"]
    assert len(lobby.matches) == 1
    m = next(iter(lobby.matches.values()))
    assert m["exercise"] == "squat"
    assert {x for team in m["teams"] for x in team} == {b, c}

    v = lobby.sync(c, "", 0, None, "1v1")
    assert v["exercise"] == "squat" and v["match"]["exercise"] == "squat"
    assert lobby.sync(a, "", 0, None, "1v1")["status"] == "queued"


def test_unknown_exercise_falls_back_to_pushup():
    lobby = Lobby(target=10)
    v = lobby.sync(None, "A", 0, "queue", "1v1", exercise="burpee")
    assert v["exercise"] == "pushup"


def test_win_is_recorded_for_both_modes(tmp_path):
    stats = server.Stats(tmp_path / "stats.json")
    lobby = Lobby(target=5, stats=stats)
    a, b = start(lobby, "Ala", "Bob")
    lobby.sync(a, "", 5, None, "1v1")            # Ala wins on target

    me = stats.of("Ala")
    assert me["wins"] == 1 and me["matches"] == 1
    assert me["byMode"] == {"1v1": 1}
    assert me["byExercise"] == {"pushup": 1}
    assert stats.of("Bob")["wins"] == 0 and stats.of("Bob")["matches"] == 1


def test_walkover_counts_as_a_win(tmp_path):
    stats = server.Stats(tmp_path / "stats.json")
    lobby = Lobby(target=20, stats=stats)
    a, b = start(lobby, "Ala", "Bob")
    lobby.sync(b, "", 0, "leave", "1v1")
    assert stats.of("Ala")["wins"] == 1


def test_a_match_is_recorded_once(tmp_path):
    stats = server.Stats(tmp_path / "stats.json")
    lobby = Lobby(target=5, stats=stats)
    a, b = start(lobby, "Ala", "Bob")
    lobby.sync(a, "", 5, None, "1v1")
    for _ in range(3):                            # dalsze odpytywanie nie dolicza wygranych
        lobby.sync(a, "", 5, None, "1v1")
        lobby.sync(b, "", 1, None, "1v1")
    assert stats.of("Ala")["wins"] == 1


def test_leaderboard_is_ordered_and_survives_restart(tmp_path):
    path = tmp_path / "stats.json"
    stats = server.Stats(path)
    stats.record("1v1", "pushup", [("Ala", 20)], [("Bob", 4)])
    stats.record("2v2", "squat", [("Ala", 20)], [("Cez", 9)])
    stats.record("1v1", "squat", [("Bob", 20)], [("Cez", 2)])

    top = stats.top(3)
    assert [p["name"] for p in top] == ["Ala", "Bob", "Cez"]
    assert top[0]["wins"] == 2 and top[0]["byMode"] == {"1v1": 1, "2v2": 1}

    again = server.Stats(path)                    # nowy proces serwera
    assert again.of("Ala")["wins"] == 2
    assert [p["name"] for p in again.top(2)] == ["Ala", "Bob"]


def test_names_are_matched_without_case(tmp_path):
    stats = server.Stats(tmp_path / "stats.json")
    stats.record("1v1", "pushup", [("Michal", 20)], [("Bob", 3)])
    stats.record("1v1", "pushup", [("michal", 20)], [("Bob", 1)])
    assert stats.of("MICHAL")["wins"] == 2
    assert len(stats.top(10)) == 2


def test_queue_counts_per_mode_and_exercise():
    lobby = Lobby(target=10)
    lobby.sync(None, "A", 0, "queue", "1v1", exercise="squat")
    for n in ("B", "C", "D"):
        lobby.sync(None, n, 0, "queue", "2v2", exercise="pushup")
    lobby.sync(None, "Idle", 0, None, "1v1", exercise="pushup")      # not queued

    q = lobby.queues()
    assert q["waiting"] == {"1v1": {"pushup": 0, "squat": 1}, "2v2": {"pushup": 3, "squat": 0}}
    assert q["needed"] == {"1v1": 2, "2v2": 4}
    assert q["playing"] == 0 and q["online"] == 5 and q["target"] == 10

    lobby.sync(None, "E", 0, "queue", "1v1", exercise="squat")        # A + E start a match
    q = lobby.queues()
    assert q["waiting"]["1v1"]["squat"] == 0
    assert q["playing"] == 2
