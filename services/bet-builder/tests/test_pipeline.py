"""Fase A4: lettura dei dati, scelta della quota, scrittura. Store finto, dati DEMO."""

from datetime import UTC, datetime, timedelta

import pytest

from predictra_bet_builder.pipeline import parse_interval, run
from predictra_bet_builder.rules import DEFAULT_RULES, Rules

# Regole precedenti all'ADR 0028 (solo modello, tutti i bookmaker): i test qui sotto
# verificano lettura, scelta della quota e scrittura con il comportamento originale.
LEGACY = Rules(rules_version="2026.11.08-1", market_weight=0.0, italian_bookmakers_only=False)

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

    def market_snapshots(self, event_ids):
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
    summary = run(store, LEGACY, now=NOW, code_commit="abc1234", triggered_by="schedule")
    assert store.started == [{"model": 7, "rules": LEGACY.as_json(), "by": "schedule"}]
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
    summary = run(store, LEGACY, now=NOW, code_commit="abc1234")
    assert summary.proposals == []
    assert store.recorded == []
    # Il pareggio non supera le soglie per selezione: nessuna combinazione da valutare.
    assert store.finished == [(55, "SUCCEEDED", 0, None)]


def test_senza_modello_attivo_nessuna_run():
    store = FakeStore(model=None)
    summary = run(store, LEGACY, now=NOW, code_commit="abc1234")
    assert summary.skipped_reason == "nessun modello attivo"
    assert store.started == []


def test_dry_run_non_scrive():
    store = FakeStore()
    summary = run(store, LEGACY, now=NOW, code_commit="abc1234", dry_run=True)
    assert summary.proposals
    assert store.started == [] and store.recorded == [] and store.finished == []


def test_errore_chiude_la_run_come_fallita():
    store = FakeStore(fail=True)
    with pytest.raises(RuntimeError):
        run(store, LEGACY, now=NOW, code_commit="abc1234")
    assert store.finished[0][1] == "FAILED"
    assert "sotto le soglie" in store.finished[0][3]


def test_partite_troppo_vicine_al_calcio_d_inizio_escluse():
    store = FakeStore()
    store.fixtures[0]["kickoff_at"] = iso(timedelta(minutes=10))
    summary = run(store, LEGACY, now=NOW, code_commit="abc1234", dry_run=True)
    assert all(leg.match_id == 2 for p in summary.proposals for leg in p.legs)


def test_adr_0028_mercato_e_solo_bookmaker_italiani():
    """Probabilità usata = media modello/mercato; quota giocabile solo da bookmaker italiani."""
    store = FakeStore()
    fresh = iso(timedelta(hours=-1))
    t = iso(timedelta(hours=-3))
    # Partita 1: due bookmaker completi (uno internazionale, uno italiano) per il consenso.
    store.snaps = [
        store._s(31, 101, "demo_int", "HOME", 2.00, t, fresh),
        store._s(32, 101, "demo_int", "DRAW", 3.50, t, fresh),
        store._s(33, 101, "demo_int", "AWAY", 4.00, t, fresh),
        store._s(41, 101, "demo_it", "HOME", 2.40, t, fresh),
        store._s(42, 101, "demo_it", "DRAW", 3.30, t, fresh),
        store._s(43, 101, "demo_it", "AWAY", 3.20, t, fresh),
        # Quota internazionale più alta sulla partita 2: non giocabile in Italia.
        store._s(51, 102, "demo_int", "HOME", 9.00, t, fresh),
    ]
    summary = run(store, DEFAULT_RULES, now=NOW, code_commit="abc1234", dry_run=True)
    legs = {leg.prediction_id: leg for p in summary.proposals for leg in p.legs}
    assert set(legs) == {2}  # partita 2 senza quote italiane: esclusa
    leg = legs[2]
    assert leg.bookmaker == "demo_it" and float(leg.price) == 2.40
    # Consenso casa: media di (1/2,00)/Σ e (1/2,40)/Σ per i due bookmaker.
    s_int = 1 / 2.00 + 1 / 3.50 + 1 / 4.00
    s_it = 1 / 2.40 + 1 / 3.30 + 1 / 3.20
    market = ((1 / 2.00) / s_int + (1 / 2.40) / s_it) / 2
    assert float(leg.market_probability) == pytest.approx(market, abs=1e-8)
    assert float(leg.model_probability) == 0.5
    assert float(leg.probability) == pytest.approx(0.5 * 0.5 + 0.5 * market, abs=1e-8)
    item = summary.proposals[0].as_batch_item(DEFAULT_RULES)
    assert item["legs"][0]["market_probability"] == pytest.approx(market, abs=1e-8)


def test_adr_0033_tutti_i_mercati_con_quote_italiane():
    """1X2, doppia chance e under/over: consenso per mercato, quota solo italiana."""
    store = FakeStore()
    fresh = iso(timedelta(hours=-1))
    t = iso(timedelta(hours=-3))

    def snap(sid, book, market, sel, price):
        s = store._s(sid, 101, book, sel, price, t, fresh)
        s["market"] = market
        return s

    store.snaps = [
        # 1X2 di un bookmaker estero: serve solo al consenso (anche per la doppia chance).
        snap(1, "demo_int", "h2h", "HOME", 2.0),
        snap(2, "demo_int", "h2h", "DRAW", 3.5),
        snap(3, "demo_int", "h2h", "AWAY", 4.0),
        # Doppia chance e under/over 2,5 di un bookmaker italiano.
        snap(4, "demo_it", "double_chance", "HOME_DRAW", 1.45),
        snap(5, "demo_it", "double_chance", "HOME_AWAY", 1.35),
        snap(6, "demo_it", "double_chance", "DRAW_AWAY", 2.0),
        snap(7, "demo_it", "totals_2_5", "OVER", 2.2),
        snap(8, "demo_it", "totals_2_5", "UNDER", 1.6),
        snap(9, "demo_int", "totals_2_5", "OVER", 2.0),
        snap(10, "demo_int", "totals_2_5", "UNDER", 1.8),
    ]
    store.preds = [
        {**store._p(31, 1, "HOME_DRAW", 0.75, iso(timedelta(hours=-2))), "market": "DOUBLE_CHANCE"},
        {
            **store._p(32, 1, "OVER", 0.55, iso(timedelta(hours=-2))),
            "market": "TOTAL_GOALS",
            "line": 2.5,
        },
        # Linea senza quote (3,0) e mercato senza quote (BTTS): ignorati.
        {
            **store._p(33, 1, "OVER", 0.4, iso(timedelta(hours=-2))),
            "market": "TOTAL_GOALS",
            "line": 3.0,
        },
        {**store._p(34, 1, "YES", 0.6, iso(timedelta(hours=-2))), "market": "BTTS"},
    ]
    from predictra_bet_builder.pipeline import collect_legs

    legs, _ = collect_legs(store, 7, NOW, timedelta(days=10), DEFAULT_RULES)
    by = {(leg.market, leg.selection): leg for leg in legs}
    assert set(by) == {("DOUBLE_CHANCE", "HOME_DRAW"), ("TOTAL_GOALS", "OVER")}
    dc = by[("DOUBLE_CHANCE", "HOME_DRAW")]
    s = 1 / 2.0 + 1 / 3.5 + 1 / 4.0
    assert float(dc.market_probability) == pytest.approx((1 / 2.0 + 1 / 3.5) / s, abs=1e-8)
    assert dc.bookmaker == "demo_it" and float(dc.price) == 1.45
    over = by[("TOTAL_GOALS", "OVER")]
    m_it = (1 / 2.2) / (1 / 2.2 + 1 / 1.6)
    m_int = (1 / 2.0) / (1 / 2.0 + 1 / 1.8)
    assert float(over.market_probability) == pytest.approx((m_it + m_int) / 2, abs=1e-8)
    assert over.line == 2.5 and float(over.price) == 2.2
    assert float(over.probability) == pytest.approx(0.5 * 0.55 + 0.5 * (m_it + m_int) / 2, abs=1e-8)
