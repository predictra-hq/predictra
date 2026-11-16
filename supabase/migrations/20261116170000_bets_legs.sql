-- Giocate con le selezioni strutturate, per chiuderle da sole a partita finita
-- (richiesta del proprietario, 16/11/2026).
--
-- Finora una giocata registrata da una schedina aveva solo testo (partite nella
-- descrizione): l'esito andava inserito a mano. `legs` conserva le selezioni come le
-- conosce il modello, una per partita:
--   [{"m": <match_id>, "k": "<mercato>", "l": <linea o null>, "s": "<esito>"}, …]
-- L'app, con la sessione dell'utente (RLS: solo proprietario), confronta le selezioni
-- con i risultati e chiude la giocata come vinta o persa. Le giocate scritte a mano
-- (senza `legs`) restano manuali. Nessun processo di sistema legge le giocate.

alter table public.bets
  add column legs jsonb
    check (
      legs is null
      or (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) between 1 and 12)
    );
