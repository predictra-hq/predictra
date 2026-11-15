"""Metriche di valutazione sull'1X2: Brier, Log Loss, calibrazione (ECE)."""

from __future__ import annotations

from typing import Any

import numpy as np

EPS = 1e-15


def one_hot(outcomes: np.ndarray, k: int = 3) -> np.ndarray:
    y = np.zeros((len(outcomes), k))
    y[np.arange(len(outcomes)), outcomes] = 1
    return y


def brier(probs: np.ndarray, outcomes: np.ndarray) -> float:
    """Brier multiclasse: media su partite di Σₖ (pₖ − oₖ)². Da 0 (perfetto) a 2."""
    return float(((probs - one_hot(outcomes, probs.shape[1])) ** 2).sum(axis=1).mean())


def log_loss(probs: np.ndarray, outcomes: np.ndarray) -> float:
    p = np.clip(probs[np.arange(len(outcomes)), outcomes], EPS, 1)
    return float(-np.log(p).mean())


def calibration(
    probs: np.ndarray, outcomes: np.ndarray, bins: int = 10
) -> tuple[float, list[dict[str, Any]]]:
    """ECE e curva di calibrazione, su tutte le coppie (probabilità, esito) delle tre classi."""
    p = probs.ravel()
    o = one_hot(outcomes, probs.shape[1]).ravel()
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    ece = 0.0
    curve = []
    for b in range(bins):
        mask = idx == b
        count = int(mask.sum())
        if count == 0:
            continue
        predicted, observed = float(p[mask].mean()), float(o[mask].mean())
        ece += count / len(p) * abs(predicted - observed)
        curve.append(
            {
                "bin_low": round(float(edges[b]), 2),
                "bin_high": round(float(edges[b + 1]), 2),
                "predicted": round(predicted, 6),
                "observed": round(observed, 6),
                "count": count,
            }
        )
    return float(ece), curve
