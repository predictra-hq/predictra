"""Identità stabile delle versioni e scelta automatica del modello attivo (ADR 0023).

1. **Versione stabile.** Una versione cambia solo se cambia il codice che produce i
   numeri: i modelli (``models/``), i dati di ingresso (``data.py``), i mercati derivati
   (``markets.py``) e il Confidence Score (``confidence.py``). Una modifica a diagnosi,
   comandi, workflow o documentazione non crea più versioni nuove, quindi il modello
   attivo continua a ricevere previsioni. Il commit git resta registrato in ogni
   versione, backtest ed esecuzione per la riproducibilità (ADR 0020).

2. **Il modello più forte diventa attivo da solo.** Tra le versioni del codice corrente
   che battono la baseline nel backtest (Brier e Log Loss, ADR 0021 §4) si sceglie quella
   con il Log Loss più basso (a parità, il Brier più basso). Diventa attiva se:
   - non c'è un modello attivo;
   - il modello attivo appartiene a un codice superato (non riceve più previsioni);
   - batte il modello attivo di almeno ``MARGIN`` di Log Loss (evita cambi continui
     tra modelli quasi equivalenti).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent
MODEL_CODE = ("models", "data.py", "markets.py", "confidence.py")
MARGIN = 0.001
# Modelli in gara (ADR 0024): i due che calcolano tutti i mercati del Bet Builder.
# Uno è il modello PREDICTRA attivo, l'altro lo sfidante.
CONTENDERS = frozenset({"poisson", "dixon_coles"})


def model_code_hash(root: Path = PACKAGE) -> str:
    """SHA-256 dei sorgenti che producono i numeri (percorso relativo + contenuto)."""
    files: list[Path] = []
    for name in MODEL_CODE:
        p = root / name
        files += sorted(p.rglob("*.py")) if p.is_dir() else [p]
    h = hashlib.sha256()
    for f in sorted(files, key=lambda x: x.relative_to(root).as_posix()):
        h.update(f.relative_to(root).as_posix().encode())
        h.update(b"\0")
        h.update(f.read_bytes().replace(b"\r\n", b"\n"))
        h.update(b"\0")
    return h.hexdigest()


@dataclass(frozen=True)
class Candidate:
    model_version_id: int
    model_key: str
    version: str
    brier: float
    log_loss: float
    baseline_brier: float | None
    baseline_log_loss: float | None

    @property
    def beats_baseline(self) -> bool:
        return (
            self.model_key != "baseline"
            and self.baseline_brier is not None
            and self.baseline_log_loss is not None
            and self.brier < self.baseline_brier
            and self.log_loss < self.baseline_log_loss
        )


@dataclass(frozen=True)
class Decision:
    model_version_id: int
    version: str
    reason: str


def choose_active(
    candidates: list[Candidate], active_id: int | None, margin: float = MARGIN
) -> Decision | None:
    """Versione da attivare, oppure ``None`` se il modello attivo resta il migliore."""
    eligible = sorted(
        (c for c in candidates if c.beats_baseline), key=lambda c: (c.log_loss, c.brier)
    )
    if not eligible:
        return None
    best = eligible[0]
    if active_id == best.model_version_id:
        return None
    current = next((c for c in candidates if c.model_version_id == active_id), None)
    if active_id is None:
        reason = "nessun modello attivo"
    elif current is None:
        reason = "il modello attivo appartiene a un codice superato"
    elif best.log_loss < current.log_loss - margin:
        reason = (
            f"Log Loss {best.log_loss:.4f} migliore di {current.log_loss:.4f} ({current.version})"
        )
    else:
        return None
    return Decision(best.model_version_id, best.version, reason)
