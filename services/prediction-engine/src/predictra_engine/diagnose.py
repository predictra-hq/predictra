"""Diagnosi in sola lettura delle previsioni visibili nell'app (M4).

Risponde a: c'è una versione attiva? Ha previsioni? Riguardano le partite in
programma? La vista ``v_active_predictions`` (quella letta dal pannello del
dettaglio partita) le restituisce? Non scrive nulla.

Gira con la chiave secret, che ignora la RLS: se qui i dati ci sono ma il pannello
resta vuoto, il problema è lato utente (permessi o pagina), non nei dati.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Protocol


class Store(Protocol):
    def select(self, relation: str, query: dict[str, str]) -> list[dict[str, Any]]: ...
    def count(self, relation: str, query: dict[str, str]) -> int: ...
    def upcoming_fixtures(self, start: datetime, end: datetime) -> list[dict[str, Any]]: ...


@dataclass
class Diagnosis:
    lines: list[str] = field(default_factory=list)
    verdict: str = ""

    def add(self, text: str) -> None:
        self.lines.append(text)


def _in(ids: list[int]) -> str:
    return f"in.({','.join(str(i) for i in ids)})"


def diagnose(store: Store, now: datetime, horizon_days: int = 7) -> Diagnosis:
    d = Diagnosis()
    versions = store.select(
        "model_versions",
        {"select": "id,model_key,version,status,activated_at", "order": "id"},
    )
    summary = {
        int(r["model_version_id"]): r
        for r in store.select(
            "v_model_versions_summary", {"select": "model_version_id,beats_baseline,backtest_id"}
        )
    }
    d.add(f"Versioni registrate: {len(versions)}")
    for v in versions:
        vid = int(v["id"])
        s = summary.get(vid, {})
        rows = store.count("predictions", {"select": "id", "model_version_id": f"eq.{vid}"})
        last = store.select(
            "predictions",
            {
                "select": "as_of",
                "model_version_id": f"eq.{vid}",
                "order": "as_of.desc",
                "limit": "1",
            },
        )
        d.add(
            f"  #{vid} {v['model_key']:<12} {v['version']:<32} stato={v['status']:<9}"
            f" backtest={'sì' if s.get('backtest_id') else 'no'}"
            f" batte_baseline={s.get('beats_baseline')} previsioni={rows}"
            f" ultimo_as_of={last[0]['as_of'] if last else '—'}"
        )

    active = [v for v in versions if v["status"] == "ACTIVE"]
    fixtures = store.upcoming_fixtures(now, now + timedelta(days=horizon_days))
    fixture_ids = [int(f["match_id"]) for f in fixtures]
    d.add(f"Partite in programma nei prossimi {horizon_days} giorni: {len(fixture_ids)}")

    if not active:
        d.verdict = (
            "NESSUNA VERSIONE ATTIVA: il pannello resta vuoto per costruzione. "
            "Attivare una versione che batte la baseline da /models (Super Admin con 2FA)."
        )
        return d

    a = active[0]
    aid = int(a["id"])
    d.add(f"Versione attiva: #{aid} {a['model_key']} {a['version']} dal {a['activated_at']}")
    if not fixture_ids:
        d.verdict = "Nessuna partita in programma nel periodo: non ci sono partite da mostrare."
        return d

    own = store.count(
        "predictions",
        {"select": "id", "model_version_id": f"eq.{aid}", "match_id": _in(fixture_ids)},
    )
    view_rows = store.select(
        "v_active_predictions",
        {"select": "match_id", "match_id": _in(fixture_ids), "market": "eq.1X2"},
    )
    covered = sorted({int(r["match_id"]) for r in view_rows})
    d.add(f"Righe della versione attiva per le partite in programma: {own}")
    d.add(
        f"v_active_predictions (1X2) copre {len(covered)} partite su {len(fixture_ids)}"
        + (f", es. match_id {covered[:5]}" if covered else "")
    )

    if own == 0:
        d.verdict = (
            "LA VERSIONE ATTIVA NON HA PREVISIONI PER LE PARTITE IN PROGRAMMA: il motore scrive "
            "per altre versioni o non è ancora girato dopo l'attivazione. Lanciare il motore."
        )
    elif not covered:
        d.verdict = (
            "LE PREVISIONI CI SONO MA LA VISTA NON LE RESTITUISCE: errore nella vista "
            "v_active_predictions (contratto M4)."
        )
    else:
        d.verdict = (
            "DATI CORRETTI: con la chiave secret la vista restituisce le previsioni. "
            "Se il pannello resta vuoto, il problema è lato utente (permessi RLS o pagina): "
            "aprire una delle "
            "partite elencate sopra."
        )
    return d
