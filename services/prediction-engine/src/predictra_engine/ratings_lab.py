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

from .cross import EVAL_FROM, JointPoisson, table
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
    model = dixon_coles_model()
    active = walk(model, results, start)
    pi = walk(PiRatings(), results, start)
    elo_comp = walk(Elo(), results, start)
    elo_global = walk(GlobalElo(), results, start)
    # Componenti del modello attivo, per sostituire l'Elo per competizione con l'Elo unico.
    goals = walk(model.goals, results, start)
    joint = walk(JointPoisson(model.joint_xi, model.joint_l2), results, start)
    # Dal 27/11/2026 (ADR 0079) il modello attivo usa l'Elo unico: la ricostruzione di
    # controllo lo usa; l'Elo per competizione resta come termine di confronto.
    elo = model.elo
    preds: dict[str, dict[int, np.ndarray]] = {
        REFERENCE: active,
        "elo per competizione": elo_comp,
        "elo unico": elo_global,
        "pi-ratings": pi,
        "attivo ricostruito": compose(goals, elo_global, joint, model.weight, model.joint_weight),
        "attivo con elo per competizione": compose(
            goals, elo_comp, joint, model.weight, model.joint_weight
        ),
    }
    preds["attivo con elo unico (peso 0.5)"] = compose(
        goals, elo_global, joint, 0.5, model.joint_weight
    )
    # Taratura dell'Elo unico: K (velocità di aggiornamento) e vantaggio casalingo.
    for k, home in (
        (15, elo.home_advantage),
        (25, elo.home_advantage),
        (30, elo.home_advantage),
        (elo.k, 40),
        (elo.k, 80),
        (25, 80),
    ):
        tuned = walk(GlobalElo(k, home), results, start)
        preds[f"attivo, elo unico K {k} casa {home}"] = compose(
            goals, tuned, joint, model.weight, model.joint_weight
        )
    preds["attivo + pi 0.15"] = mix(active, pi, 0.15)
    lines += table(preds, results, names, REFERENCE)
    return lines


def compose(
    goals: dict[int, np.ndarray],
    elo: dict[int, np.ndarray],
    joint: dict[int, np.ndarray],
    elo_weight: float,
    joint_weight: float,
) -> dict[int, np.ndarray]:
    """Come il modello PREDICTRA: (1 − j)·[(1 − w)·gol + w·Elo] + j·unico, rinormalizzato."""
    out = {}
    for i in set(goals) & set(elo):
        inner = (1 - elo_weight) * goals[i] + elo_weight * elo[i]
        inner = inner / inner.sum()
        if i in joint:
            p = (1 - joint_weight) * inner + joint_weight * joint[i]
            out[i] = p / p.sum()
        else:
            out[i] = inner
    return out
