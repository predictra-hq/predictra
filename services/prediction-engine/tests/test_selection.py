"""ADR 0023: impronta del codice dei modelli e scelta automatica del più forte."""

from pathlib import Path

from predictra_engine.selection import Candidate, choose_active, model_code_hash


def c(mv, key, ll, brier=0.6, base_ll=1.0, base_brier=0.65):
    return Candidate(mv, key, f"{key}-v{mv}", brier, ll, base_brier, base_ll)


def test_impronta_stabile_e_limitata_al_codice_dei_modelli(tmp_path: Path):
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "goals.py").write_text("x = 1\n")
    for name in ("data.py", "markets.py", "confidence.py", "diagnose.py"):
        (tmp_path / name).write_text(f"# {name}\n")
    a = model_code_hash(tmp_path)
    assert a == model_code_hash(tmp_path)
    (tmp_path / "diagnose.py").write_text("# diagnosi cambiata\n")
    assert model_code_hash(tmp_path) == a  # la diagnosi non cambia la versione
    (tmp_path / "models" / "goals.py").write_text("x = 2\n")
    assert model_code_hash(tmp_path) != a
    # stesso contenuto con a capo Windows: stessa impronta
    (tmp_path / "models" / "goals.py").write_bytes(b"x = 1\r\n")
    assert model_code_hash(tmp_path) == a


def test_impronta_del_pacchetto_reale():
    assert len(model_code_hash()) == 64


def test_sceglie_il_log_loss_piu_basso_tra_chi_batte_la_baseline():
    cands = [
        c(1, "baseline", 1.0, 0.65),
        c(2, "elo", 0.99),
        c(3, "poisson", 0.97),
        c(4, "dixon_coles", 0.96),
        c(5, "elo", 0.90, brier=0.70),  # Log Loss basso ma Brier peggiore della baseline
    ]
    d = choose_active(cands, None)
    assert d is not None and d.model_version_id == 4 and d.reason == "nessun modello attivo"


def test_non_cambia_per_differenze_minime_e_cambia_oltre_il_margine():
    cands = [c(3, "poisson", 0.9700), c(4, "dixon_coles", 0.9695)]
    assert choose_active(cands, 3) is None  # 0,0005 < margine 0,001
    cands = [c(3, "poisson", 0.9700), c(4, "dixon_coles", 0.9600)]
    d = choose_active(cands, 3)
    assert d is not None and d.model_version_id == 4 and "migliore" in d.reason
    assert choose_active(cands, 4) is None  # il migliore è già attivo


def test_modello_attivo_di_un_codice_superato():
    d = choose_active([c(7, "poisson", 0.97)], 3)
    assert d is not None and d.reason == "il modello attivo appartiene a un codice superato"


def test_nessuno_batte_la_baseline():
    assert choose_active([c(1, "baseline", 1.0), c(2, "elo", 1.01)], None) is None
