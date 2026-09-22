"""Testy nie moga dopisywac sie do prawdziwej tabeli wynikow serwera."""
import pytest

from pushups import server


@pytest.fixture(autouse=True)
def isolated_stats(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "STATS_FILE", tmp_path / "stats.json")
