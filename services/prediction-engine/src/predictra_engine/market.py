"""Prova in sola lettura: peso del mercato nella probabilità combinata (ADR 0028).

Comando ``market``: sulle partite finite con quote 1X2 raccolte prima del calcio
d'inizio confronta il Log Loss del modello attivo, del mercato senza margine (media dei
bookmaker, normalizzazione proporzionale) e della combinazione ``(1 − w)·modello +
w·mercato`` per diversi pesi. Non scrive nulla.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

import numpy as np

from .data import parse_ts
from .metrics import log_loss

OUTCOMES = ("HOME", "DRAW", "AWAY")
WEIGHTS = (0.0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0)
LOOKBACK_DAYS = 60


def consensus(odds: list[dict[str, Any]], kickoff: dict[int, datetime]) -> dict[int, np.ndarray]:
    """Probabilità 1X2 del mercato per partita, solo da quote osservate prima del via."""
    books: dict[tuple[int, str], dict[str, float]] = defaultdict(dict)
    for o in odds:
        match = o.get("match_id")
        if match is None or int(match) not in kickoff:
            continue
        if parse_ts(str(o["observed_at"])) >= kickoff[int(match)]:
            continue
        price = float(o["price"])
        if price > 1:
            books[(int(match), str(o["bookmaker"]))][str(o["selection"])] = price
    sums: dict[int, list[np.ndarray]] = defaultdict(list)
    for (match, _), book in books.items():
        if all(s in book for s in OUTCOMES):
            implied = np.array([1 / book[s] for s in OUTCOMES])
            sums[match].append(implied / implied.sum())
    return {m: np.mean(v, axis=0) for m, v in sums.items()}


def compare(
    model: dict[int, np.ndarray], market: dict[int, np.ndarray], outcome: dict[int, int]
) -> list[str]:
    ids = sorted(set(model) & set(market) & set(outcome))
    if not ids:
        return ["  nessuna partita con previsione, quote prima del via e risultato"]
    y = np.array([outcome[i] for i in ids])
    pm = np.array([model[i] for i in ids])
    pk = np.array([market[i] for i in ids])
    lines = [f"  partite {len(ids)}"]
    for w in WEIGHTS:
        p = (1 - w) * pm + w * pk
        label = "modello" if w == 0 else "mercato" if w == 1 else f"peso mercato {w:.1f}"
        lines.append(f"  {label:<18} LogLoss={log_loss(p, y):.4f}")
    return lines


def run_market(store: Any, now: datetime) -> list[str]:
    since = now - timedelta(days=LOOKBACK_DAYS)
    results = store.select_all(
        "v_match_results",
        {
            "select": "match_id,kickoff_at,home_score,away_score",
            "kickoff_at": f"gte.{since.isoformat()}",
            "order": "match_id",
        },
    )
    outcome = {
        int(r["match_id"]): 0
        if r["home_score"] > r["away_score"]
        else 1
        if r["home_score"] == r["away_score"]
        else 2
        for r in results
    }
    kickoff = {int(r["match_id"]): parse_ts(str(r["kickoff_at"])) for r in results}
    ids = sorted(outcome)
    model: dict[int, np.ndarray] = {}
    odds: list[dict[str, Any]] = []
    for i in range(0, len(ids), 150):
        chunk = ",".join(str(x) for x in ids[i : i + 150])
        rows = store.select_all(
            "v_active_predictions",
            {
                "select": "match_id,selection,probability",
                "market": "eq.1X2",
                "match_id": f"in.({chunk})",
                "order": "match_id,selection",
            },
        )
        probs: dict[int, dict[str, float]] = defaultdict(dict)
        for r in rows:
            probs[int(r["match_id"])][str(r["selection"])] = float(r["probability"])
        for m, p in probs.items():
            if all(s in p for s in OUTCOMES):
                model[m] = np.array([p[s] for s in OUTCOMES])
        odds += store.select_all(
            "v_latest_odds",
            {
                "select": "match_id,bookmaker,selection,price,observed_at",
                "market": "eq.h2h",
                "match_id": f"in.({chunk})",
                "order": "match_id,bookmaker,selection",
            },
        )
    lines = [
        f"Peso del mercato (sola lettura) — partite finite dal {since.date()}: {len(outcome)},"
        f" con previsione {len(model)}"
    ]
    return lines + compare(model, consensus(odds, kickoff), outcome)
