"""Stessi casi di packages/shared-types/src/bet-builder.test.ts."""

import json
from pathlib import Path

import pytest

from predictra_bet_builder.rules import (
    DEFAULT_RULES,
    category_for_probability,
    expected_value,
    independent_probability,
    rank_score,
)

TS = Path(__file__).parents[3] / "packages" / "shared-types" / "src" / "bet-builder.ts"


def test_expected_value():
    assert expected_value(0.5, 2.5) == pytest.approx(0.25)
    assert expected_value(0.25, 3.4) == pytest.approx(-0.15)


def test_independent_probability():
    p = independent_probability([0.5, 0.55])
    assert p == pytest.approx(0.275)
    assert expected_value(p, 2.5 * 2.2) == pytest.approx(0.5125)
    assert independent_probability([]) == 1


def test_categories():
    assert category_for_probability(0.5) == "CONSERVATIVE"
    assert category_for_probability(0.499) == "BALANCED"
    assert category_for_probability(0.25) == "BALANCED"
    assert category_for_probability(0.249) == "AGGRESSIVE"


def test_rank_score():
    assert rank_score(0.5, 2.5, 0.6) == pytest.approx(0.12)
    assert rank_score(0.5, 2.2, 0.6) > rank_score(0.2, 5.5, 0.6)
    with pytest.raises(ValueError):
        rank_score(1, 2, 0.5)
    with pytest.raises(ValueError):
        rank_score(0.5, 1, 0.5)


def test_default_rules_match_shared_types():
    """Le soglie Python e TypeScript devono coincidere (ADR 0025 §3)."""
    source = TS.read_text(encoding="utf-8")
    block = source.split("DEFAULT_BET_BUILDER_RULES: Readonly<BetBuilderRules> = {", 1)[1]
    block = block.split("};", 1)[0]
    pairs = {}
    for raw in block.strip().splitlines():
        key, value = raw.strip().rstrip(",").split(":", 1)
        pairs[key.strip()] = json.loads(value.strip())
    assert pairs == DEFAULT_RULES.as_json()
