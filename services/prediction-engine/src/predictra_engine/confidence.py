"""Confidence Score (ADR 0022): quanto fidarsi della stima, tra 0 e 1."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

WEIGHTS = {"sample": 0.30, "calibration": 0.25, "agreement": 0.25, "data": 0.20}
SAMPLE_FULL = 20  # partite
ECE_ZERO = 0.10
DISTANCE_ZERO = 0.20


@dataclass(frozen=True)
class Confidence:
    score: float
    sample: float
    calibration: float
    agreement: float
    data: float

    def components(self) -> dict[str, float]:
        d = asdict(self)
        d.pop("score")
        return {k: round(v, 4) for k, v in d.items()}


def sample_component(games: int) -> float:
    return min(1.0, games / SAMPLE_FULL)


def calibration_component(ece: float | None) -> float:
    return 0.0 if ece is None else max(0.0, 1 - ece / ECE_ZERO)


def agreement_component(own: np.ndarray, others: list[np.ndarray]) -> float:
    if not others:
        return 0.5
    distance = float(np.mean([np.abs(own - o).mean() for o in others]))
    return 1 - min(1.0, distance / DISTANCE_ZERO)


def data_component(quality: str, freshness: str) -> float:
    if quality == "ERROR":
        return 0.0
    if quality == "WARNING" or freshness == "STALE":
        return 0.5
    return 1.0


def confidence(
    *,
    games: int,
    ece: float | None,
    own: np.ndarray,
    others: list[np.ndarray],
    quality: str,
    freshness: str,
) -> Confidence:
    parts = {
        "sample": sample_component(games),
        "calibration": calibration_component(ece),
        "agreement": agreement_component(own, others),
        "data": data_component(quality, freshness),
    }
    score = sum(WEIGHTS[k] * v for k, v in parts.items())
    return Confidence(score=round(score, 4), **parts)
