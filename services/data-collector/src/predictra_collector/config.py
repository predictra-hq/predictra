"""Configurazione da variabili d'ambiente. Nessun segreto nel codice (regola 6 di CLAUDE.md)."""

from __future__ import annotations

import os
from dataclasses import dataclass

# Competizioni della v1 (ADR 0010 §3): codici football-data.org.
V1_COMPETITIONS: tuple[str, ...] = ("SA", "PL", "PD", "BL1", "FL1", "DED", "PPL", "CL")

# Chiavi The Odds API delle competizioni della v1 (ADR 0015 §1).
ODDS_SPORT_KEYS: dict[str, str] = {
    "SA": "soccer_italy_serie_a",
    "PL": "soccer_epl",
    "PD": "soccer_spain_la_liga",
    "BL1": "soccer_germany_bundesliga",
    "FL1": "soccer_france_ligue_one",
    "DED": "soccer_netherlands_eredivisie",
    "PPL": "soccer_portugal_primeira_liga",
    "CL": "soccer_uefa_champs_league",
}


class ConfigError(RuntimeError):
    """Configurazione mancante o non valida."""


@dataclass(frozen=True)
class Settings:
    football_data_api_key: str | None
    odds_api_key: str | None
    supabase_url: str | None
    supabase_secret_key: str | None

    def require_supabase(self) -> tuple[str, str]:
        if not self.supabase_url or not self.supabase_secret_key:
            raise ConfigError(
                "Servono SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SECRET_KEY "
                "per scrivere su Supabase (oppure usa --dry-run)."
            )
        return self.supabase_url.rstrip("/"), self.supabase_secret_key

    def require_football_data(self) -> str:
        if not self.football_data_api_key:
            raise ConfigError("Variabile FOOTBALL_DATA_API_KEY mancante.")
        return self.football_data_api_key

    def require_odds(self) -> str:
        if not self.odds_api_key:
            raise ConfigError("Variabile ODDS_API_KEY mancante.")
        return self.odds_api_key

    def secrets(self) -> tuple[str, ...]:
        return tuple(
            s
            for s in (self.football_data_api_key, self.odds_api_key, self.supabase_secret_key)
            if s
        )


def load_settings(env: dict[str, str] | None = None) -> Settings:
    source = os.environ if env is None else env
    url = (source.get("SUPABASE_URL") or source.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    if url and not url.startswith("https://"):
        raise ConfigError("SUPABASE_URL deve iniziare con https://")
    return Settings(
        football_data_api_key=(source.get("FOOTBALL_DATA_API_KEY") or "").strip() or None,
        odds_api_key=(source.get("ODDS_API_KEY") or "").strip() or None,
        supabase_url=url or None,
        supabase_secret_key=(source.get("SUPABASE_SECRET_KEY") or "").strip() or None,
    )


def parse_competitions(value: str | None) -> tuple[str, ...]:
    """Elenco separato da virgole; vuoto = competizioni della v1. Solo codici della v1."""
    if not value or not value.strip():
        return V1_COMPETITIONS
    codes = tuple(dict.fromkeys(c.strip().upper() for c in value.split(",") if c.strip()))
    unknown = [c for c in codes if c not in V1_COMPETITIONS]
    if unknown:
        raise ConfigError(
            f"Competizioni non previste dalla v1 (ADR 0010): {', '.join(unknown)}. "
            f"Ammesse: {', '.join(V1_COMPETITIONS)}."
        )
    return codes
