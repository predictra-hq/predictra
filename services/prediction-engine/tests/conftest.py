"""Campionato DEMO simulato: dati sintetici per i test, mai scritti su DEV.

Forze note: la squadra 1 è la più forte, la 20 la più debole. I gol seguono
Poisson con queste forze, così i test possono verificare che i modelli le ritrovino.
"""

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from predictra_engine.data import MatchResult

START = datetime(2025, 8, 15, 18, 0, tzinfo=UTC)


def simulate_league(seed: int = 7, teams: int = 20, competition_id: int = 900) -> list[MatchResult]:
    rng = np.random.default_rng(seed)
    strength = np.linspace(0.45, -0.45, teams)  # attacco = difesa = forza
    fixtures = [(h, a) for h in range(teams) for a in range(teams) if h != a]
    rng.shuffle(fixtures)
    results = []
    for i, (h, a) in enumerate(fixtures):
        kickoff = START + timedelta(days=(i // (teams // 2)) * 3.5)
        lh = np.exp(0.15 + 0.25 + strength[h] - strength[a])
        la = np.exp(0.15 + strength[a] - strength[h])
        results.append(
            MatchResult(
                match_id=10_000 + i,
                competition_id=competition_id,
                kickoff_at=kickoff,
                home=h + 1,
                away=a + 1,
                home_goals=int(rng.poisson(lh)),
                away_goals=int(rng.poisson(la)),
            )
        )
    return sorted(results, key=lambda r: (r.kickoff_at, r.match_id))


@pytest.fixture(scope="session")
def league() -> list[MatchResult]:
    return simulate_league()
