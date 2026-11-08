"""Adapter The Odds API v4 (scheda: docs/data-sources/the-odds-api.md, ADR 0015).

- La chiave va nel parametro di query ``apiKey``: gli errori non riportano mai l'URL.
- Ogni chiamata alle quote costa (mercati per regioni) crediti: qui 1, ``h2h`` su ``eu``.
  ``/events`` è gratuito. Il client legge gli header ``x-requests-remaining`` e
  ``x-requests-last`` e si rifiuta di chiamare sotto la riserva.
- ``normalize_odds`` produce il lotto accettato da ``public.ingest_odds_batch``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx

PROVIDER = "the-odds-api"
BASE_URL = "https://api.the-odds-api.com/v4"
REGION = "eu"
MARKET = "h2h"
CREDIT_RESERVE = 20  # ADR 0015 §2


class OddsApiError(RuntimeError):
    """Errore del provider. Il messaggio non contiene mai la chiave né l'URL."""


class BudgetExhausted(OddsApiError):
    """Crediti sotto la riserva: la raccolta si ferma (ADR 0015 §2)."""


def _int_header(response: httpx.Response, name: str) -> int | None:
    value = response.headers.get(name)
    try:
        return int(float(value)) if value is not None else None
    except ValueError:
        return None


@dataclass
class OddsApiClient:
    api_key: str
    http: httpx.Client = field(default_factory=lambda: httpx.Client(timeout=30.0))
    reserve: int = CREDIT_RESERVE
    credits_used: int = 0
    remaining: int | None = None

    def _get(self, path: str, params: dict[str, str]) -> Any:
        try:
            response = self.http.get(f"{BASE_URL}{path}", params={**params, "apiKey": self.api_key})
        except httpx.HTTPError as exc:
            raise OddsApiError(f"Richiesta {path} non riuscita: {type(exc).__name__}") from None
        last = _int_header(response, "x-requests-last")
        remaining = _int_header(response, "x-requests-remaining")
        if last is not None:
            self.credits_used += last
        if remaining is not None:
            self.remaining = remaining
        if response.status_code >= 400:
            message = ""
            try:
                body = response.json()
                if isinstance(body, dict) and body.get("message"):
                    message = str(body["message"])[:200]
            except ValueError:
                pass
            raise OddsApiError(
                f"The Odds API {path}: HTTP {response.status_code} {message}".strip()
            )
        return response.json()

    def events(self, sport_key: str) -> list[dict[str, Any]]:
        """Eventi in programma (gratuito)."""
        data = self._get(f"/sports/{sport_key}/events", {"dateFormat": "iso"})
        return data if isinstance(data, list) else []

    def odds(self, sport_key: str) -> list[dict[str, Any]]:
        """Quote 1X2 della regione eu (1 credito se ci sono eventi)."""
        if self.remaining is not None and self.remaining < self.reserve:
            raise BudgetExhausted(
                f"Crediti residui {self.remaining} sotto la riserva di {self.reserve}"
            )
        data = self._get(
            f"/sports/{sport_key}/odds",
            {"regions": REGION, "markets": MARKET, "oddsFormat": "decimal", "dateFormat": "iso"},
        )
        return data if isinstance(data, list) else []


@dataclass
class NormalizedOdds:
    batch: dict[str, Any]
    issues: list[dict[str, Any]]
    outcome_names: set[str]


def _selection(name: str, home: str, away: str) -> str | None:
    if name == home:
        return "HOME"
    if name == away:
        return "AWAY"
    # Nome del pareggio da confermare con una risposta reale (scheda della fonte).
    if name.strip().lower() == "draw":
        return "DRAW"
    return None


def _valid_price(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and value > 1


def normalize_odds(
    events: list[dict[str, Any]], competition_code: str, sport_key: str, observed_at: str
) -> NormalizedOdds:
    """Trasforma la risposta di /odds nel lotto canonico; scarta esiti e quote non validi."""
    issues: list[dict[str, Any]] = []
    outcome_names: set[str] = set()
    out_events: list[dict[str, Any]] = []

    for ev in events:
        event_id, home, away = ev.get("id"), ev.get("home_team"), ev.get("away_team")
        if not event_id or not home or not away or not ev.get("commence_time"):
            issues.append(
                {
                    "check_code": "odds.event_incomplete",
                    "severity": "WARNING",
                    "entity_type": None,
                    "provider_entity_id": str(event_id) if event_id else None,
                    "details": {},
                }
            )
            continue
        books = []
        for book in ev.get("bookmakers") or []:
            markets = []
            for market in book.get("markets") or []:
                if market.get("key") != MARKET:
                    continue
                outcomes = []
                for outcome in market.get("outcomes") or []:
                    name = str(outcome.get("name") or "")
                    outcome_names.add(name)
                    selection = _selection(name, home, away)
                    if selection is None or not _valid_price(outcome.get("price")):
                        continue
                    outcomes.append({"selection": selection, "price": outcome["price"]})
                if outcomes:
                    markets.append(
                        {
                            "key": MARKET,
                            # last_update del mercato; quello del bookmaker è deprecato.
                            "last_update": market.get("last_update") or book.get("last_update"),
                            "outcomes": outcomes,
                        }
                    )
            if markets and book.get("key"):
                books.append(
                    {
                        "key": book["key"],
                        "title": book.get("title") or book["key"],
                        "region": REGION,
                        "markets": markets,
                    }
                )
        out_events.append(
            {
                "provider_event_id": str(event_id),
                "commence_time": ev["commence_time"],
                "home_team": home,
                "away_team": away,
                "bookmakers": books,
            }
        )

    batch = {
        "observed_at": observed_at,
        "competition_code": competition_code,
        "sport_key": sport_key,
        "events": out_events,
    }
    return NormalizedOdds(batch, issues, outcome_names)
