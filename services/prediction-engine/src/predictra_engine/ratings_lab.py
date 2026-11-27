"""Prova in sola lettura dei pi-ratings e dell'Elo unico (ADR 0079).

Backtest walk-forward settimanale dal 1/7/2024 (stesse partite per tutti), confronto con il
modello PREDICTRA attivo: da soli e in combinazione sull'1X2, con la differenza di Log Loss
partita per partita e ± 2 errori standard, in tutto, per stagione e per competizione.
Nessuna scrittura sul database.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np

from .cross import EVAL_FROM, table
from .data import MatchResult
from .models.blend import dixon_coles_model
from .models.elo import Elo
from .models.ratings import GlobalElo, PiRatings
from .stats import walk

REFERENCE = "PREDICTRA (attivo)"


def mix(a: dict[int, np.ndarray], b: dict[int, np.ndarray], w: float) -> dict[int, np.ndarray]:
    """(1 − w)·a + w·b sulle partite comuni, rinormalizzato."""
    out = {}
    for i in set(a) & set(b):
        p = (1 - w) * a[i] + w * b[i]
        out[i] = p / p.sum()
    return out


def run_ratings(store: Any, as_of: datetime, start: datetime = EVAL_FROM) -> list[str]:
    results = sorted(
        (MatchResult.from_row(r) for r in store.training_results(as_of)),
        key=lambda r: (r.kickoff_at, r.match_id),
    )
    names = {
        int(c["id"]): str(c.get("code") or c.get("name") or c["id"])
        for c in store.select("competitions", {"select": "id,code,name"})
    }
    lines = [f"Pi-ratings ed Elo unico (sola lettura) — as_of {as_of.isoformat()}"]
    lines.append(f"  partite di addestramento {len(results)}, valutazione dal {start.date()}")
    active = walk(dixon_coles_model(), results, start)
    pi = walk(PiRatings(), results, start)
    pi_fast = walk(PiRatings(lam=0.05, gamma=0.5), results, start)
    elo_global = walk(GlobalElo(), results, start)
    preds: dict[str, dict[int, np.ndarray]] = {
        REFERENCE: active,
        "elo per competizione": walk(Elo(), results, start),
        "elo unico": elo_global,
        "pi-ratings": pi,
        "pi-ratings λ 0,05 γ 0,5": pi_fast,
    }
    for w in (0.15, 0.3):
        preds[f"attivo + pi {w}"] = mix(active, pi, w)
        preds[f"attivo + elo unico {w}"] = mix(active, elo_global, w)
    preds["attivo + pi 0,15 + elo unico 0,15"] = mix(mix(active, pi, 0.15 / 0.85), elo_global, 0.15)
    lines += table(preds, results, names, REFERENCE)
    return lines
