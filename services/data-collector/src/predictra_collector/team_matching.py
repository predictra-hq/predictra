"""Abbinamento delle squadre tra provider con un confronto ampio dei nomi (ADR 0011).

Gli alias esatti non bastano: "Bayern München" (API-Football) e "FC Bayern München"
(football-data.org) sono la stessa squadra. Qui i nomi si confrontano:

1. per **chiave**: minuscole, senza accenti né punteggiatura, senza numeri e senza sigle
   societarie (FC, AC, SSC…). Due nomi con la stessa chiave sono la stessa squadra;
2. se nessuna chiave coincide, per **inclusione**: le parole di un nome sono tutte nel
   nome dell'altro ("Marseille" in "Olympique de Marseille").

Si suggerisce una squadra solo se la candidata è **una sola**: in caso di dubbio nessun
abbinamento, e la squadra viene segnalata (`team.cross_provider_unmatched`) per un alias
manuale. Il suggerimento finisce nel lotto come ``same_as_team_id``; il database lo
ricontrolla (la squadra deve esistere e non avere già un altro ID dello stesso provider).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

# Sigle e parole societarie che non distinguono una squadra.
STOPWORDS = frozenset(
    {
        "fc", "cf", "ac", "as", "ssc", "sc", "afc", "cd", "ud", "rc", "rcd", "sd", "ca",
        "us", "sv", "vfl", "vfb", "tsg", "bv", "bc", "fk", "sk", "club", "de", "del", "la",
        "le", "fsv", "tsv", "ssv", "ogc", "sco", "calcio", "futbol", "football",
    }
)  # fmt: skip


def tokens(name: str | None) -> frozenset[str]:
    if not name:
        return frozenset()
    text = name.replace("ß", "ss")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    words = re.split(r"[^a-z0-9]+", text)
    return frozenset(w for w in words if w and not w.isdigit() and w not in STOPWORDS)


@dataclass
class KnownTeam:
    id: int
    name: str
    keys: set[frozenset[str]] = field(default_factory=set)


@dataclass
class TeamMatcher:
    teams: list[KnownTeam]

    @classmethod
    def from_rows(cls, rows: list[dict[str, Any]]) -> TeamMatcher:
        """Righe di `teams?select=id,name,short_name,team_aliases(alias)`."""
        known: list[KnownTeam] = []
        for r in rows:
            names = [r.get("name"), r.get("short_name")]
            names += [a.get("alias") for a in r.get("team_aliases") or [] if isinstance(a, dict)]
            keys = {tokens(n) for n in names if n}
            keys.discard(frozenset())
            if keys:
                known.append(KnownTeam(int(r["id"]), str(r.get("name")), keys))
        return cls(known)

    def match(self, name: str) -> KnownTeam | None:
        key = tokens(name)
        if not key:
            return None
        exact = [t for t in self.teams if key in t.keys]
        if len(exact) == 1:
            return exact[0]
        if exact:
            return None
        # Inclusione: almeno una parola significativa (4+ lettere) nella parte comune.
        partial = [
            t
            for t in self.teams
            if any((key <= k or k <= key) and any(len(w) >= 4 for w in (key & k)) for k in t.keys)
        ]
        return partial[0] if len(partial) == 1 else None
