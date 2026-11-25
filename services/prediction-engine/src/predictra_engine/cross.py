"""Prova in sola lettura: un modello gol unico su tutte le competizioni.

Comando ``cross``. Oggi ogni competizione si adatta da sola (``Model.fit``): in Champions
League una squadra conta solo le poche partite europee e le neopromosse non usano le
partite della serie inferiore. Qui attacco e difesa di ogni squadra sono **comuni a tutte
le competizioni**; ogni competizione ha il suo livello di gol (μ) e il suo vantaggio
casalingo. Le partite tra squadre di campionati diversi (coppe europee) collegano i
campionati tra loro.

    log λ_casa = μ_c + h_c + att_casa − dif_ospite;  log λ_ospite = μ_c + att_ospite − dif_casa

Pesi nel tempo exp(−ξ·giorni) e penalità L2 come nel modello per competizione. Il
backtest è walk-forward settimanale sui risultati veri, con le sole partite precedenti.
Non scrive nulla.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

import numpy as np

from .data import MatchResult
from .metrics import brier, log_loss
from .models.base import Model
from .models.blend import EloBlendModel, dixon_coles_model
from .models.goals import poisson_model
from .models.joint import fit_joint
from .stats import walk

EVAL_FROM = datetime(2024, 7, 1, tzinfo=UTC)
SECOND_SEASON = datetime(2025, 7, 1, tzinfo=UTC)
# Coppe tra squadre di campionati diversi.
CUPS = frozenset({"CL", "EL", "ECL"})


class JointPoisson(Model):
    """Adattatore per ``stats.walk``: ``fit`` restituisce un oggetto con ``covers`` e 1X2."""

    def __init__(self, xi: float = 0.0015, l2: float = 3.0) -> None:
        self.key = f"unico[xi={xi},l2={l2}]"
        self.xi = xi
        self.l2 = l2

    def hyperparameters(self) -> dict[str, Any]:
        return {"joint": True, "xi_per_day": self.xi, "l2": self.l2}

    def fit_competition(self, results: list[MatchResult], as_of: datetime) -> Any:
        raise NotImplementedError("modello unico: si adatta su tutte le competizioni insieme")

    def fit(self, results: list[MatchResult], as_of: datetime) -> Any:  # type: ignore[override]
        return fit_joint(results, as_of, self.xi, self.l2)


def table(
    preds: dict[str, dict[int, np.ndarray]],
    results: list[MatchResult],
    names: dict[int, str],
    reference_key: str | None = None,
) -> list[str]:
    """Log Loss e Brier 1X2 per modello, in tutto, per stagione e per competizione, sulle
    stesse partite; differenza dal modello di riferimento con ± 2 errori standard."""
    common = set.intersection(*(set(p) for p in preds.values()))
    by_id = {r.match_id: r for r in results}
    groups: dict[str, list[int]] = defaultdict(list)
    for i in sorted(common):
        groups["TUTTE"].append(i)
        season = "2024-25" if by_id[i].kickoff_at < SECOND_SEASON else "2025-26"
        groups[f"TUTTE {season}"].append(i)
        comp = names.get(by_id[i].competition_id, str(by_id[i].competition_id))
        groups[comp].append(i)
        groups[f"{comp} {season}"].append(i)
    lines = []
    reference = next(iter(preds.values())) if reference_key is None else preds[reference_key]
    for group, ids in sorted(groups.items(), key=lambda g: (not g[0].startswith("TUTTE"), g[0])):
        y = np.array([by_id[i].outcome for i in ids])
        lines.append(f"  {group} ({len(ids)} partite)")
        ref = np.array([reference[i][by_id[i].outcome] for i in ids])
        for key, p in preds.items():
            probs = np.array([p[i] for i in ids])
            # Differenza di Log Loss rispetto al riferimento, partita per partita, con il
            # suo errore standard: dice se la differenza è più grande del caso.
            own = np.array([p[i][by_id[i].outcome] for i in ids])
            diff = -np.log(np.clip(own, 1e-15, 1)) + np.log(np.clip(ref, 1e-15, 1))
            se = float(diff.std(ddof=1) / np.sqrt(len(diff))) if len(diff) > 1 else 0.0
            lines.append(
                f"    {key:<28} LogLoss={log_loss(probs, y):.4f}  Brier={brier(probs, y):.4f}"
                f"  diff={diff.mean():+.4f} ± {2 * se:.4f}"
            )
    return lines


def previous_model() -> EloBlendModel:
    """Il modello PREDICTRA prima dell'ADR 0074: Dixon-Coles + Elo, senza modello unico."""
    m = dixon_coles_model()
    return EloBlendModel(m.key, m.goals, m.elo, m.weight)


def run_cross(store: Any, as_of: datetime, start: datetime = EVAL_FROM) -> list[str]:
    results = sorted(
        (MatchResult.from_row(r) for r in store.training_results(as_of)),
        key=lambda r: (r.kickoff_at, r.match_id),
    )
    names = {
        int(c["id"]): str(c.get("code") or c.get("name") or c["id"])
        for c in store.select("competitions", {"select": "id,code,name"})
    }
    lines = [f"Modello unico su tutte le competizioni (sola lettura) — as_of {as_of.isoformat()}"]
    lines.append(f"  partite di addestramento {len(results)}, valutazione dal {start.date()}")
    preds: dict[str, dict[int, np.ndarray]] = {
        "poisson per competizione": walk(poisson_model(), results, start),
        "dixon_coles + elo": walk(previous_model(), results, start),
    }
    preds["unico l2=3"] = walk(JointPoisson(0.0015, 3.0), results, start)
    # Media tra il modello attuale più forte e il modello unico: errori diversi.
    best = preds["dixon_coles + elo"]
    joint = preds["unico l2=3"]
    both = set(best) & set(joint)
    preds["media dc+elo e unico"] = {i: (best[i] + joint[i]) / 2 for i in both}
    for wj in (0.3, 0.7):
        preds[f"media, peso unico {wj}"] = {i: (1 - wj) * best[i] + wj * joint[i] for i in both}
    cups = {c for c, name in names.items() if name in CUPS}
    comp_of = {r.match_id: r.competition_id for r in results}
    preds["media solo in coppa"] = {
        i: (best[i] + joint[i]) / 2 if comp_of[i] in cups else best[i] for i in both
    }
    # Controllo: il modello PREDICTRA del codice deve dare la stessa media (peso 0,3).
    preds["modello PREDICTRA nuovo"] = walk(dixon_coles_model(), results, start)
    lines += table(preds, results, names, "dixon_coles + elo")
    return lines
