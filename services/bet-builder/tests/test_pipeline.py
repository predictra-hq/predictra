"""Fase A4: lettura dei dati, scelta della quota, scrittura. Store finto, dati DEMO."""

from datetime import UTC, datetime, timedelta

import pytest

from predictra_bet_builder.pipeline import parse_interval, run
from predictra_bet_builder.rules import DEFAULT_RULES

NOW = datetime(2026, 11, 20, 8, 0, tzinfo=UTC)


def iso(delta: timedelta) -> str:
    return (NOW + delta).isoformat()


class FakeStore:
    def __init__(self, *, model: int | None = 7, fail: bool = False):
        self.model = model
        self.fail = fail
        self.started: list[dict] = []
        self.recorded: list[list[dict]] = []
        self.finished: list[tuple] = []
        k1, k2 = timedelta(hours=30), timedelta(hours=33)
        self.fixtures = [
            {"match_id": 1, "kickoff_at": iso(k1), "home_team_id": 10, "away_team_id": 11},
            {"match_id": 2, "kickoff_at": iso(k2), "home_team_id": 12, "away_team_id": 13},
        ]
        old, new = iso(timedelta(hours=-6)), iso(timedelta(hours=-2))
        self.preds = [
            # Previsione superata per la partita 1: va ignorata.
            self._p(1, 1, "HOME", 0.40, old),
            self._p(2, 1, "HOME", 0.50, new),
            self._p(3, 1, "DRAW", 0.25, new),
            self._p(4, 2, "HOME", 0.55, new, conf=0.5),
        ]
        fresh, stale = iso(timedelta(hours=-1)), iso(timedelta(hours=-13))
        self.snaps = [
            # Partita 1: demo_a 2,40 (vecchia event_time) poi 2,50; demo_b 2,45.
            self._s(11, 101, "demo_a", "HOME", 2.40, iso(timedelta(hours=-5)), fresh),
            self._s(12, 101, "demo_a", "HOME", 2.50, iso(timedelta(hours=-3)), fresh),
            self._s(13, 101, "demo_b", "HOME", 2.45, iso(timedelta(hours=-3)), fresh),
            # Quota più alta ma STALE, e una con qualità WARNING: scartate.
            self._s(14, 101, "demo_c", "HOME", 9.00, iso(timedelta(hours=-14)), stale),
            self._s(15, 101, "demo_d", "HOME", 8.00, iso(timedelta(hours=-3)), fresh, "WARNING"),
            self._s(16, 101, "demo_a", "DRAW", 3.40, iso(timedelta(hours=-3)), fresh),
            self._s(21, 102, "demo_a", "HOME", 2.20, iso(timedelta(hours=-3)), fresh),
        ]

    @staticmethod
    def _p(pid, match, sel, p, as_of, conf=0.6):
        return {
            "id": pid,
            "match_id": match,
            "market": "1X2",
            "line": None,
            "selection": sel,
            "probability": p,
            "push_probability": None,
            "confidence_score": conf,
            "as_of": as_of,
        }

    @staticmethod
    def _s(sid, event, bookmaker, sel, price, event_time, observed, quality="OK"):
        return {
            "id": sid,
            "event_id": event,
            "bookmaker": bookmaker,
            "selection": sel,
            "price": price,
            "provider": "the-odds-api",
            "event_time": event_time,
            "observed_at": observed,
            "quality": quality,
        }

    def active_model_version(self):
        return self.model

    def upcoming_fixtures(self, start, end):
        return [f for f in self.fixtures if start < datetime.fromisoformat(f["kickoff_at"]) < end]

    def predictions(self, model_version_id, match_ids):
        assert model_version_id == self.model
        return [p for p in self.preds if p["match_id"] in set(match_ids)]

    def odds_events(self, match_ids):
        return [
            e
            for e in ({"id": 101, "match_id": 1}, {"id": 102, "match_id": 2})
            if e["match_id"] in set(match_ids)
        ]

    def h2h_snapshots(self, event_ids):
        return [s for s in self.snaps if s["event_id"] in set(event_ids)]

    def odds_max_age(self):
        return {"the-odds-api": "12:00:00"}

    def start_run(self, model_version_id, code_commit, rules, triggered_by):
        self.started.append({"model": model_version_id, "rules": rules, "by": triggered_by})
        return 55

    def record_proposals(self, run_id, proposals):
        if self.fail:
            raise RuntimeError("Proposta sotto le soglie della run")
        self.recorded.append(proposals)
        return {"proposals": len(proposals), "skipped": 0}

    def finish_run(self, run_id, status, candidates, error):
        self.finished.append((run_id, status, candidates, error))


def test_intervalli_di_postgres():
    assert parse_interval("12:00:00") == timedelta(hours=12)
    assert parse_interval("1 day 02:30:00") == timedelta(days=1, hours=2, minutes=30)
    assert parse_interval("3 days") == timedelta(days=3)
    with pytest.raises(ValueError):
        parse_interval("PT12H")


def test_run_completa():
    store = FakeStore()
    summary = run(store, DEFAULT_RULES, now=NOW, code_commit="abc1234", triggered_by="schedule")
    assert store.started == [{"model": 7, "rules": DEFAULT_RULES.as_json(), "by": "schedule"}]
    items = [i for batch in store.recorded for i in batch]
    # Partita 1 casa con la quota più recente e più alta ammessa (demo_a 2,50, snapshot 12).
    single = next(i for i in items if i["category"] == "CONSERVATIVE")
    assert single["legs"] == [{"prediction_id": 2, "odds_snapshot_id": 12}]
    double = next(i for i in items if len(i["legs"]) == 2)
    assert double["legs"] == [
        {"prediction_id": 2, "odds_snapshot_id": 12},
        {"prediction_id": 4, "odds_snapshot_id": 21},
    ]
    assert summary.written == len(items)
    assert store.finished == [(55, "SUCCEEDED", summary.candidates, None)]


def test_zero_proposte_resta_una_run_riuscita():
    store = FakeStore()
    store.snaps = [s for s in store.snaps if s["selection"] == "DRAW"]  # solo EV negativo
    summary = run(store, DEFAULT_RULES, now=NOW, code_commit="abc1234")
    assert summary.proposals == []
    assert store.recorded == []
    # Il pareggio non supera le soglie per selezione: nessuna combinazione da valutare.
    assert store.finished == [(55, "SUCCEEDED", 0, None)]


def test_senza_modello_attivo_nessuna_run():
    store = FakeStore(model=None)
    summary = run(store, DEFAULT_RULES, now=NOW, code_commit="abc1234")
    assert summary.skipped_reason == "nessun modello attivo"
    assert store.started == []


def test_dry_run_non_scrive():
    store = FakeStore()
    summary = run(store, DEFAULT_RULES, now=NOW, code_commit="abc1234", dry_run=True)
    assert summary.proposals
    assert store.started == [] and store.recorded == [] and store.finished == []


def test_errore_chiude_la_run_come_fallita():
    store = FakeStore(fail=True)
    with pytest.raises(RuntimeError):
        run(store, DEFAULT_RULES, now=NOW, code_commit="abc1234")
    assert store.finished[0][1] == "FAILED"
    assert "sotto le soglie" in store.finished[0][3]


def test_partite_troppo_vicine_al_calcio_d_inizio_escluse():
    store = FakeStore()
    store.fixtures[0]["kickoff_at"] = iso(timedelta(minutes=10))
    summary = run(store, DEFAULT_RULES, now=NOW, code_commit="abc1234", dry_run=True)
    assert all(leg.match_id == 2 for p in summary.proposals for leg in p.legs)
