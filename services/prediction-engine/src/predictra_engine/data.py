"""Tipi dei dati in ingresso e impronta dei dati di addestramento (ADR 0020)."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class MatchResult:
    """Partita conclusa (riga di ``training_results``)."""

    match_id: int
    competition_id: int
    kickoff_at: datetime
    home: int
    away: int
    home_goals: int
    away_goals: int

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> MatchResult:
        return cls(
            match_id=int(row["match_id"]),
            competition_id=int(row["competition_id"]),
            kickoff_at=parse_ts(str(row["kickoff_at"])),
            home=int(row["home_team_id"]),
            away=int(row["away_team_id"]),
            home_goals=int(row["home_score"]),
            away_goals=int(row["away_score"]),
        )

    @property
    def outcome(self) -> int:
        """0 = casa, 1 = pareggio, 2 = ospite."""
        if self.home_goals > self.away_goals:
            return 0
        return 1 if self.home_goals == self.away_goals else 2


@dataclass(frozen=True)
class Fixture:
    """Partita da prevedere (riga di ``v_match_center``)."""

    match_id: int
    competition_id: int
    kickoff_at: datetime
    home: int
    away: int
    quality: str = "OK"
    freshness: str = "FRESH"

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> Fixture:
        return cls(
            match_id=int(row["match_id"]),
            competition_id=int(row["competition_id"]),
            kickoff_at=parse_ts(str(row["kickoff_at"])),
            home=int(row["home_team_id"]),
            away=int(row["away_team_id"]),
            quality=str(row.get("quality") or "OK"),
            freshness=str(row.get("freshness") or "FRESH"),
        )


def training_data_hash(results: Iterable[MatchResult]) -> str:
    """SHA-256 dell'elenco ordinato (match_id, home_score, away_score) (ADR 0020 §1)."""
    lines = sorted(f"{r.match_id},{r.home_goals},{r.away_goals}" for r in results)
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def sha256_json(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()
