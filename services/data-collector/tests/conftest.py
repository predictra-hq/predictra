import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def match_fixture() -> dict[str, Any]:
    return load("fd_match_330299.json")


@pytest.fixture
def standings_fixture() -> dict[str, Any]:
    return load("fd_standings_pd_2021.json")


@pytest.fixture
def matches_payload(match_fixture: dict[str, Any]) -> dict[str, Any]:
    """Involucro di GET /competitions/{code}/matches attorno alla partita ufficiale."""
    return {"competition": match_fixture["competition"], "matches": [match_fixture]}
