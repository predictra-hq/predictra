"""Abbinamento delle squadre tra provider con un confronto ampio dei nomi (ADR 0011).

Gli alias esatti non bastano: "Bayern München" (API-Football) e "FC Bayern München"
(football-data.org) sono la stessa squadra. Qui i nomi si confrontano:

1. per **chiave**: minuscole, senza accenti né punteggiatura, senza numeri e senza sigle
   societarie (FC, AC, SSC…). Due nomi con la stessa chiave sono la stessa squadra;
2. se nessuna chiave coincide, per **inclusione**: le parole del nome nuovo sono tutte in
   un nome già noto ("Marseille" in "Olympique de Marseille"), mai il contrario.

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

    def _exact(self, key: frozenset[str]) -> list[KnownTeam]:
        return [t for t in self.teams if key in t.keys]

    def _partial(self, key: frozenset[str]) -> list[KnownTeam]:
        # Inclusione in una sola direzione: il nome nuovo è contenuto in un nome noto
        # ("Marseille" in "Olympique de Marseille"), con almeno una parola di 4+ lettere.
        # Mai il contrario: un alias corto ("Sparta") dentro un nome più lungo
        # ("Sparta Praha") abbinerebbe squadre diverse.
        return [
            t for t in self.teams if any(key <= k and any(len(w) >= 4 for w in key) for k in t.keys)
        ]

    def match(self, name: str) -> KnownTeam | None:
        """Abbinamento di un solo nome (vedi `match_all` per un lotto)."""
        return self.match_all([name]).get(name)

    def match_all(self, names: list[str]) -> dict[str, KnownTeam]:
        """Abbinamenti di tutte le squadre di un lotto.

        Prima gli abbinamenti per chiave, poi quelli per inclusione. Un abbinamento per
        inclusione si scarta se la squadra è già presa da un altro nome del lotto
        ("FC Eindhoven" non diventa PSV se nello stesso lotto c'è "PSV Eindhoven") o se
        due nomi la indicano entrambi.
        """
        out: dict[str, KnownTeam] = {}
        pending: list[tuple[str, frozenset[str]]] = []
        for name in dict.fromkeys(names):
            key = tokens(name)
            if not key:
                continue
            exact = self._exact(key)
            if len(exact) == 1:
                out[name] = exact[0]
            elif not exact:
                pending.append((name, key))
        taken = {t.id for t in out.values()}
        partial: dict[str, KnownTeam] = {}
        for name, key in pending:
            found = self._partial(key)
            if len(found) == 1 and found[0].id not in taken:
                partial[name] = found[0]
        counts: dict[int, int] = {}
        for t in partial.values():
            counts[t.id] = counts.get(t.id, 0) + 1
        out.update({n: t for n, t in partial.items() if counts[t.id] == 1})
        return out
