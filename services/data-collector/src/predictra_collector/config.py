"""Configurazione da variabili d'ambiente. Nessun segreto nel codice (regola 6 di CLAUDE.md)."""

from __future__ import annotations

import os
from dataclasses import dataclass

# Competizioni della v1 (ADR 0010 §3): codici football-data.org.
V1_COMPETITIONS: tuple[str, ...] = ("SA", "PL", "PD", "BL1", "FL1", "DED", "PPL", "CL")


class ConfigError(RuntimeError):
    """Configurazione mancante o non valida."""


@dataclass(frozen=True)
class Settings:
    football_data_api_key: str
    supabase_url: str | None
    supabase_secret_key: str | None

    def require_supabase(self) -> tuple[str, str]:
        if not self.supabase_url or not self.supabase_secret_key:
            raise ConfigError(
                "Servono SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SECRET_KEY "
                "per scrivere su Supabase (oppure usa --dry-run)."
            )
        return self.supabase_url.rstrip("/"), self.supabase_secret_key


def load_settings(env: dict[str, str] | None = None) -> Settings:
    source = os.environ if env is None else env
    key = (source.get("FOOTBALL_DATA_API_KEY") or "").strip()
    if not key:
        raise ConfigError("Variabile FOOTBALL_DATA_API_KEY mancante.")
    url = (source.get("SUPABASE_URL") or source.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    if url and not url.startswith("https://"):
        raise ConfigError("SUPABASE_URL deve iniziare con https://")
    secret = (source.get("SUPABASE_SECRET_KEY") or "").strip()
    return Settings(
        football_data_api_key=key,
        supabase_url=url or None,
        supabase_secret_key=secret or None,
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
