"""Esecuzione del motore: adattamento, versioni, backtest, previsioni (ADR 0020–0023).

Versione = famiglia + iperparametri + impronta del codice dei modelli (ADR 0023: non
più il commit dell'intero servizio). A ogni esecuzione il
modello si riadatta in modo deterministico sui dati di ``training_results(as_of)``:
versione + ``as_of`` bastano a riprodurre ogni previsione. ``parameters`` conserva
gli iperparametri e i parametri stimati al momento della registrazione.
"""

from __future__ import annotations

import contextlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Protocol

import numpy as np

from .backtest import BacktestResult, backtest_models
from .confidence import confidence
from .data import Fixture, MatchResult, parse_ts, sha256_json, training_data_hash
from .markets import derive_markets, markets_1x2
from .models import FittedModel, Model
from .selection import CONTENDERS, Candidate, Decision, choose_active, model_code_hash

CHUNK = 500
# Confronto settimanale (ADR 0023, modifica del 11/11/2026): i backtest più vecchi di
# così si rifanno per tutti i modelli insieme, con i dati aggiornati.
BACKTEST_MAX_AGE = timedelta(days=7)


class Store(Protocol):
    def training_results(self, as_of: datetime) -> list[dict[str, Any]]: ...
    def upcoming_fixtures(self, start: datetime, end: datetime) -> list[dict[str, Any]]: ...
    def find_model_version(self, model_key: str, version: str) -> int | None: ...
    def latest_backtest(self, model_version_id: int) -> dict[str, Any] | None: ...
    def active_model_version(self) -> int | None: ...
    def auto_activate(self, model_version_id: int, reason: str) -> None: ...
    def retire_superseded(self, keep: list[int]) -> int: ...
    def register_model_version(self, payload: dict[str, Any]) -> int: ...
    def record_backtest(self, payload: dict[str, Any]) -> int: ...
    def start_run(self, model_version_id: int, code_commit: str, triggered_by: str) -> int: ...
    def record_predictions(self, run_id: int, batch: dict[str, Any]) -> dict[str, int]: ...
    def finish_run(self, run_id: int, status: str, matches: int, error: str | None) -> None: ...
    def prune_predictions(self, keep_days: int) -> dict[str, int]: ...


@dataclass
class ModelSummary:
    key: str
    version: str
    model_version_id: int | None = None
    backtest: BacktestResult | None = None
    backtest_recorded: bool = False
    predictions: int = 0
    matches: int = 0
    error: str | None = None


@dataclass
class RunSummary:
    as_of: datetime
    training_matches: int
    fixtures: int
    data_hash: str
    models: list[ModelSummary] = field(default_factory=list)
    model_code: str = ""
    refreshed_backtests: bool = False
    retired: int = 0
    pruned: int = 0
    prune_error: str | None = None
    selection: Decision | None = None
    active_before: int | None = None

    @property
    def failed(self) -> bool:
        return any(m.error for m in self.models)


def version_label(model: Model, code_id: str) -> str:
    """Famiglia, iperparametri e impronta del codice dei modelli (ADR 0023)."""
    spec = sha256_json({"model": model.key, "hyperparameters": model.hyperparameters()})
    return f"{model.key}-{spec[:8]}-{code_id[:7]}"


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def prediction_rows(
    fitted: FittedModel,
    fixture: Fixture,
    *,
    as_of: datetime,
    label: str,
    data_hash: str,
    ece: float | None,
    others: list[np.ndarray],
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Righe di ``predictions`` (e la matrice, se il modello ne ha una) per una partita."""
    p1x2 = fitted.probabilities_1x2(fixture)
    conf = confidence(
        games=fitted.games_played(fixture),
        ece=ece,
        own=p1x2,
        others=others,
        quality=fixture.quality,
        freshness=fixture.freshness,
    )
    matrix = fitted.score_matrix(fixture)
    prices = derive_markets(matrix) if matrix is not None else markets_1x2(p1x2)
    features_hash = sha256_json(
        {
            "version": label,
            "match_id": fixture.match_id,
            "home": fixture.home,
            "away": fixture.away,
            "competition_id": fixture.competition_id,
            "as_of": _iso(as_of),
            "training_data_hash": data_hash,
        }
    )
    lambdas = fitted.lambdas(fixture)
    summary = {
        "confidence": conf.components(),
        "training_games_min": fitted.games_played(fixture),
        "training_data_hash": data_hash,
    }
    if lambdas is not None:
        summary["lambda_home"], summary["lambda_away"] = round(lambdas[0], 5), round(lambdas[1], 5)
        if lambdas[2] is not None:
            summary["rho"] = round(lambdas[2], 5)
    rows = [
        {
            "match_id": fixture.match_id,
            "market": p.market,
            "line": p.line,
            "selection": p.selection,
            "probability": round(min(max(p.probability, 0.0), 1.0), 8),
            "push_probability": None if p.push is None else round(min(max(p.push, 0.0), 1.0), 8),
            "confidence_score": conf.score,
            "explanation": summary if p.market == "1X2" else {"confidence": conf.components()},
            "features_hash": features_hash,
            "as_of": _iso(as_of),
        }
        for p in prices
    ]
    matrix_row = None
    if matrix is not None and lambdas is not None:
        matrix_row = {
            "match_id": fixture.match_id,
            "as_of": _iso(as_of),
            "lambda_home": round(lambdas[0], 5),
            "lambda_away": round(lambdas[1], 5),
            "rho": None if lambdas[2] is None else round(lambdas[2], 5),
            "max_goals": matrix.shape[0] - 1,
            "matrix": [[round(float(x), 8) for x in row] for row in matrix],
        }
    return rows, matrix_row


def run(
    store: Store,
    models: list[Model],
    *,
    now: datetime,
    code_commit: str,
    horizon_days: int = 10,
    triggered_by: str = "schedule",
    dry_run: bool = False,
    model_code: str | None = None,
) -> RunSummary:
    as_of = now.replace(microsecond=0)
    results = [MatchResult.from_row(r) for r in store.training_results(as_of)]
    fixtures = [
        Fixture.from_row(r)
        for r in store.upcoming_fixtures(as_of, as_of + timedelta(days=horizon_days))
    ]
    data_hash = training_data_hash(results)
    code_id = model_code or model_code_hash()
    summary = RunSummary(as_of, len(results), len(fixtures), data_hash, model_code=code_id)
    if not results:
        return summary

    fitted = {m.key: m.fit(results, as_of) for m in models}
    labels = {m.key: version_label(m, code_id) for m in models}
    summaries = {m.key: ModelSummary(m.key, labels[m.key]) for m in models}
    summary.models = list(summaries.values())

    # Versioni: solo i modelli in gara (CONTENDERS, ADR 0024). Baseline ed Elo restano
    # strumenti interni: la baseline come riferimento del backtest, Elo come secondo
    # parere per l'accordo tra modelli del Confidence Score. Non si registrano.
    contenders = [m for m in models if m.key in CONTENDERS]
    window = (min(r.kickoff_at for r in results), max(r.kickoff_at for r in results))
    ece: dict[str, float | None] = {}
    recorded: dict[str, dict[str, Any]] = {}
    needs_backtest: list[str] = []
    for m in contenders:
        s = summaries[m.key]
        if dry_run:
            needs_backtest.append(m.key)
            continue
        s.model_version_id = store.find_model_version(m.key, s.version)
        if s.model_version_id is None:
            s.model_version_id = store.register_model_version(
                {
                    "model_key": m.key,
                    "version": s.version,
                    "code_commit": code_commit,
                    "parameters": {
                        "hyperparameters": m.hyperparameters(),
                        "fitted": fitted[m.key].parameters(),
                    },
                    "training_window_start": _iso(window[0]),
                    "training_window_end": _iso(window[1]),
                    "training_data_hash": data_hash,
                    "training_matches": len(results),
                }
            )
        latest = store.latest_backtest(s.model_version_id)
        if latest is None:
            needs_backtest.append(m.key)
        else:
            recorded[m.key] = latest
            ece[m.key] = None if latest.get("ece") is None else float(latest["ece"])

    # Confronto settimanale: se un backtest manca o ha più di BACKTEST_MAX_AGE, si
    # rifanno tutti, sulle stesse partite aggiornate, così il confronto resta equo e
    # il modello attivo resta il più forte anche quando cambiano solo i dati.
    stale = any(
        "created_at" in r and as_of - parse_ts(str(r["created_at"])) > BACKTEST_MAX_AGE
        for r in recorded.values()
    )
    if stale or (needs_backtest and recorded):
        needs_backtest = [m.key for m in contenders]
    summary.refreshed_backtests = stale

    # Backtest delle versioni nuove (o di tutte, nel confronto settimanale), tutti sulle
    # stesse partite della baseline.
    if needs_backtest:
        backtests = backtest_models(models, results)
        base = backtests.get("baseline")
        for key, bt in backtests.items():
            if key not in CONTENDERS:
                summaries[key].backtest = bt  # solo per il riepilogo
        for key in needs_backtest:
            bt = backtests.get(key)
            s = summaries[key]
            s.backtest = bt
            if bt is None:
                continue
            ece[key] = bt.ece
            if not dry_run and s.model_version_id is not None:
                store.record_backtest(
                    {
                        "model_version_id": s.model_version_id,
                        "baseline_model_version_id": None,
                        "window_start": _iso(bt.window_start),
                        "window_end": _iso(bt.window_end),
                        "matches": bt.matches,
                        "brier": round(bt.brier, 6),
                        "log_loss": round(bt.log_loss, 6),
                        "ece": round(bt.ece, 6),
                        "baseline_brier": round(base.brier, 6) if base else None,
                        "baseline_log_loss": round(base.log_loss, 6) if base else None,
                        "calibration": bt.calibration,
                        "code_commit": code_commit,
                    }
                )
                s.backtest_recorded = True

    # Il modello più forte diventa attivo da solo (ADR 0023).
    candidates: list[Candidate] = []
    base_bt = summaries["baseline"].backtest if "baseline" in summaries else None
    for m in contenders:
        s = summaries[m.key]
        mv = s.model_version_id if s.model_version_id is not None else -1
        if s.backtest is not None:
            candidates.append(
                Candidate(
                    mv,
                    m.key,
                    s.version,
                    s.backtest.brier,
                    s.backtest.log_loss,
                    base_bt.brier if base_bt else None,
                    base_bt.log_loss if base_bt else None,
                )
            )
        elif m.key in recorded:
            r = recorded[m.key]

            def num(v: Any) -> float | None:
                return None if v is None else float(v)

            candidates.append(
                Candidate(
                    mv,
                    m.key,
                    s.version,
                    float(r["brier"]),
                    float(r["log_loss"]),
                    num(r.get("baseline_brier")),
                    num(r.get("baseline_log_loss")),
                )
            )
    if not dry_run:
        summary.active_before = store.active_model_version()
        summary.selection = choose_active(candidates, summary.active_before)
        if summary.selection is not None:
            store.auto_activate(summary.selection.model_version_id, summary.selection.reason)
        # Le versioni superate (codice vecchio, famiglie non più in gara) si ritirano:
        # restano nello storico per la riproducibilità, non come modelli in elenco.
        keep = [summaries[m.key].model_version_id for m in contenders]
        summary.retired = store.retire_superseded([k for k in keep if k is not None])
    else:
        summary.selection = choose_active(candidates, None)

    # Previsioni delle partite in arrivo.
    p1x2 = {
        key: {fx.match_id: f.probabilities_1x2(fx) for fx in fixtures if f.covers(fx)}
        for key, f in fitted.items()
    }
    for m in contenders:
        s = summaries[m.key]
        rows: list[dict[str, Any]] = []
        matrices: list[dict[str, Any]] = []
        scored = 0
        for fx in fixtures:
            if not fitted[m.key].covers(fx):
                continue
            others = [p1x2[k][fx.match_id] for k in p1x2 if k != m.key and fx.match_id in p1x2[k]]
            r, mx = prediction_rows(
                fitted[m.key],
                fx,
                as_of=as_of,
                label=s.version,
                data_hash=data_hash,
                ece=ece.get(m.key),
                others=others,
            )
            rows.extend(r)
            if mx is not None:
                matrices.append(mx)
            scored += 1
        s.matches = scored
        if dry_run or s.model_version_id is None or not rows:
            s.predictions = len(rows)
            continue
        run_id = store.start_run(s.model_version_id, code_commit, triggered_by)
        try:
            written = 0
            for i in range(0, len(rows), CHUNK):
                written += store.record_predictions(run_id, {"predictions": rows[i : i + CHUNK]})[
                    "predictions"
                ]
            for i in range(0, len(matrices), 50):
                store.record_predictions(run_id, {"score_matrices": matrices[i : i + 50]})
            s.predictions = written
            store.finish_run(run_id, "SUCCEEDED", scored, None)
        except Exception as exc:
            s.error = f"{type(exc).__name__}: {exc}"[:500]
            with contextlib.suppress(Exception):
                store.finish_run(run_id, "FAILED", scored, s.error)
    if not dry_run and not summary.failed:
        summary.pruned, summary.prune_error = prune(store)
    return summary


# Conservazione (ADR 0041, 17/11/2026): previsioni superate da più di una settimana.
PRUNE_KEEP_DAYS = 7
PRUNE_MAX_ROUNDS = 50


def prune(store: Store) -> tuple[int, str | None]:
    """Cancella a blocchi le previsioni superate. Un errore non fa fallire il giro: si
    riporta nel riepilogo e si riprova al giro successivo."""
    total = 0
    try:
        for _ in range(PRUNE_MAX_ROUNDS):
            done = store.prune_predictions(PRUNE_KEEP_DAYS)
            total += int(done.get("predictions", 0))
            if not done.get("predictions") and not done.get("score_matrices"):
                break
    except Exception as exc:
        return total, f"{type(exc).__name__}: {exc}"[:300]
    return total, None
