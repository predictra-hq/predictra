"""Fasi A2 e A3: candidati, soglie, categorie e ranking. Dati DEMO."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from predictra_bet_builder.builder import Leg, build_proposals, eligible_legs
from predictra_bet_builder.rules import DEFAULT_RULES, Rules

DAY = datetime(2026, 11, 21, 15, 0, tzinfo=UTC)  # sabato 21/11, ore 16 a Roma


def leg(
    i: int,
    p: str,
    price: str,
    conf: str = "0.6",
    *,
    home: int | None = None,
    away: int | None = None,
    match: int | None = None,
    offset_h: int = 0,
    selection: str = "HOME",
) -> Leg:
    return Leg(
        prediction_id=100 + i,
        match_id=match if match is not None else i,
        kickoff_at=DAY + timedelta(hours=offset_h),
        home_team_id=home if home is not None else 2 * i,
        away_team_id=away if away is not None else 2 * i + 1,
        market="1X2",
        line=None,
        selection=selection,
        probability=Decimal(p),
        confidence=Decimal(conf),
        odds_snapshot_id=1000 + i,
        bookmaker="demo_it",
        price=Decimal(price),
    )


def test_soglie_delle_selezioni():
    legs = [
        leg(1, "0.50", "2.50"),  # EV 0,25: ammessa
        leg(2, "0.25", "3.40"),  # EV −0,15
        leg(3, "0.15", "8.00"),  # probabilità < 0,20
        leg(4, "0.50", "2.50", conf="0.30"),  # Confidence < 0,40
        leg(5, "0.50", "2.03"),  # EV 0,015 < 0,02
    ]
    assert [x.prediction_id for x in eligible_legs(legs, DEFAULT_RULES)] == [101]


def test_singola_e_multipla_con_i_valori_del_database():
    proposals, evaluated = build_proposals(
        [leg(1, "0.5", "2.5"), leg(2, "0.55", "2.2", conf="0.5")], DEFAULT_RULES
    )
    assert evaluated == 3  # due singole e una doppia
    by_legs = {tuple(x.prediction_id for x in p.legs): p for p in proposals}
    double = by_legs[(101, 102)]
    assert double.category == "BALANCED"
    assert (double.probability, double.combined_price, double.expected_value) == (
        Decimal("0.27500000"),
        Decimal("5.500000"),
        Decimal("0.512500"),
    )
    assert double.confidence == Decimal("0.5")
    single = by_legs[(101,)]
    assert (single.category, single.rank) == ("CONSERVATIVE", 1)
    assert single.expected_value == Decimal("0.250000")
    item = double.as_batch_item(DEFAULT_RULES)
    assert item["legs"] == [
        {"prediction_id": 101, "odds_snapshot_id": 1001},
        {"prediction_id": 102, "odds_snapshot_id": 1002},
    ]
    assert item["explanation"]["correlation"] == "independence"


def test_nessuna_schedina_forzata():
    legs = [leg(1, "0.25", "3.40"), leg(2, "0.30", "3.00")]  # EV ≤ −0,1
    assert build_proposals(legs, DEFAULT_RULES) == ([], 0)
    assert build_proposals([], DEFAULT_RULES) == ([], 0)


def test_mai_stessa_partita_o_stessa_squadra():
    legs = [
        leg(1, "0.5", "2.5", match=1),
        leg(2, "0.3", "4.0", match=1, home=2, away=3, selection="AWAY"),  # stessa partita
        leg(3, "0.5", "2.5", home=2),  # squadra 2 = casa della partita 1
    ]
    proposals, _ = build_proposals(legs, DEFAULT_RULES)
    assert all(len(p.legs) == 1 for p in proposals)
    assert len(proposals) == 3


def test_adr_0036_multiple_nello_stesso_turno():
    # Venerdì 20, sabato 21 e lunedì 23: stesso turno. Martedì 24: turno successivo.
    legs = [
        leg(1, "0.5", "2.5", offset_h=-24),
        leg(2, "0.5", "2.5"),
        leg(3, "0.5", "2.5", offset_h=48),
        leg(4, "0.5", "2.5", offset_h=72),
    ]
    proposals, _ = build_proposals(legs, DEFAULT_RULES)
    multiples = [p for p in proposals if len(p.legs) > 1]
    assert max(len(p.legs) for p in proposals) == 3
    assert all(104 not in {x.prediction_id for x in p.legs} for p in multiples)
    triple = next(p for p in proposals if len(p.legs) == 3)
    assert str(triple.slate_date) == "2026-11-20"  # data della prima partita
    assert {str(p.slate_date) for p in proposals if len(p.legs) == 1} == {
        "2026-11-20",
        "2026-11-21",
        "2026-11-23",
        "2026-11-24",
    }


def test_adr_0036_inizio_del_turno():
    from datetime import date

    from predictra_bet_builder.builder import round_start

    friday, tuesday = date(2026, 11, 20), date(2026, 11, 24)
    for d, start in [
        (date(2026, 11, 20), friday),
        (date(2026, 11, 22), friday),
        (date(2026, 11, 23), friday),
        (date(2026, 11, 24), tuesday),
        (date(2026, 11, 26), tuesday),
    ]:
        assert round_start(d) == start


def test_adr_0036_ogni_numero_di_selezioni_rappresentato():
    # Singole molto forti e multiple più deboli: la migliore multipla di ogni misura resta.
    legs = [leg(i, "0.6", "2.0") for i in range(1, 7)]  # EV 0,2 ciascuna
    rules = Rules(max_legs=3, max_proposals_per_category=4)
    proposals, _ = build_proposals(legs, rules)
    sizes_by_cat: dict[str, set[int]] = {}
    for p in proposals:
        sizes_by_cat.setdefault(p.category, set()).add(len(p.legs))
    assert sizes_by_cat["CONSERVATIVE"] == {1}  # le multiple hanno p < 0,5
    assert {2, 3} <= sizes_by_cat["AGGRESSIVE"] | sizes_by_cat["BALANCED"]
    for cat in sizes_by_cat:
        group = [p for p in proposals if p.category == cat]
        assert [p.rank_score for p in group] == sorted((p.rank_score for p in group), reverse=True)


def test_giornata_nel_fuso_di_roma():
    # 23:30 UTC del 21/11 è già il 22/11 a Roma.
    late = replace(leg(1, "0.5", "2.5"), kickoff_at=datetime(2026, 11, 21, 23, 30, tzinfo=UTC))
    proposals, _ = build_proposals([late], DEFAULT_RULES)
    assert str(proposals[0].slate_date) == "2026-11-22"


def test_ranking_massimo_per_categoria_e_posizioni():
    legs = [leg(i, "0.55", str(Decimal("2.0") + Decimal(i) / 10)) for i in range(1, 9)]
    rules = Rules(max_proposals_per_category=3)
    proposals, _ = build_proposals(legs, rules)
    for cat in ("CONSERVATIVE", "BALANCED", "AGGRESSIVE"):
        group = [p for p in proposals if p.category == cat]
        assert len(group) <= 3
        assert [p.rank for p in group] == list(range(1, len(group) + 1))
        assert [p.rank_score for p in group] == sorted((p.rank_score for p in group), reverse=True)
    best_single = next(p for p in proposals if p.category == "CONSERVATIVE" and p.rank == 1)
    assert best_single.legs[0].prediction_id == 108  # quota più alta, stessa probabilità


def test_max_legs():
    legs = [leg(i, "0.8", "1.40") for i in range(1, 7)]  # EV 0,12 ciascuna
    proposals, evaluated = build_proposals(legs, Rules(max_legs=2, max_proposals_per_category=50))
    assert max(len(p.legs) for p in proposals) == 2
    assert evaluated == 6 + 15
