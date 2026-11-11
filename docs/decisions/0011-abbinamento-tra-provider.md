# ADR 0011 — Abbinamento tra provider di partite

**Stato:** Proposta (da accettare con il merge da parte di `gennpalm`) · **Data:** 2026-11-11 · **Milestone:** M2 (fase A3)

## Contesto

Fino all'11/11/2026 le partite arrivavano da un solo provider, football-data.org. Con API-Football (storico 2022–2024, [scheda](../data-sources/api-football.md)) le stesse squadre arrivano con ID e nomi diversi: per esempio "FC Internazionale Milano" (nome breve "Inter") da football-data.org e "Inter" da API-Football.

`ingest_football_batch` ritrovava le squadre solo tramite `provider_entity_map`. Così ogni provider creava le **sue** squadre, e lo storico di API-Football non si sarebbe collegato alla stagione in corso: per i modelli (M4) sarebbero state squadre diverse.

## Decisione

Migrazione `20261111160000_football_cross_provider.sql`, che sostituisce `ingest_football_batch` senza cambiare il formato del lotto.

1. **Squadre:** se una squadra non è mappata per il provider, si cerca tra gli alias esistenti (`team_by_alias`, già usata per le quote in M3) prima con il nome e poi con il nome breve.
   - Abbinamento solo se l'alias indica **una sola** squadra e se quella squadra non ha già un altro ID dello stesso provider.
   - Altrimenti la squadra è nuova. Se la competizione ha già dati di un altro provider, la squadra nuova è segnalata in `data_quality_issues` con `team.cross_provider_unmatched` (WARNING). La correzione passa da un alias nella pagina _Alias squadre_ (M3).
   - **Suggerimento dell'adapter** (migrazione `20261111170000_football_team_hint.sql`). Gli alias esatti non bastano ("Bayern München" e "FC Bayern München"). L'adapter confronta i nomi in modo più ampio (`services/data-collector/src/predictra_collector/team_matching.py`):
     - per chiave: minuscole, senza accenti, punteggiatura, numeri e sigle societarie (FC, AC, SSC…);
     - altrimenti per inclusione, in una sola direzione: il nome nuovo è contenuto in un nome noto ("Marseille" in "Olympique de Marseille"), con almeno una parola di 4+ lettere;
     - un abbinamento per inclusione si scarta se la squadra è già presa da un altro nome dello stesso lotto, o se due nomi la indicano.

     Quando la candidata è una sola, il lotto porta `teams[].same_as_team_id`. La funzione la usa solo se la squadra esiste e non ha già un altro ID dello stesso provider. Il dry run del backfill mostra tutti gli abbinamenti prima di scrivere: nel primo (11/11/2026) ha rivelato tre errori del confronto, poi corretti: "FC Eindhoven" → PSV, "Inter Club d'Escaldes" → Inter e "Sparta Praha" → Sparta Rotterdam.

2. **Stagioni:** oltre alla data d'inizio esatta, si accetta la stagione della stessa competizione con data d'inizio entro **31 giorni**.
3. **Partite:** la stessa partita di un altro provider (stessa stagione, stesse squadre, calcio d'inizio entro **2 giorni**) viene mappata e non duplicata.
4. **Proprietà dei dati:** competizioni, stagioni, squadre e partite si aggiornano solo dal provider che le ha create. Un provider non sovrascrive nomi e risultati di un altro; aggiunge solo la propria mappatura e i propri alias.

La funzione restituisce anche `teams_matched`, `teams_unmatched` e `matches_matched`.

Per football-data.org da solo il comportamento non cambia: le sue entità sono già mappate.

## Alternative scartate

- **Tabella di corrispondenza scritta a mano** per ogni squadra: più precisa, ma da mantenere per 8 competizioni e circa 160 squadre. Resta possibile come correzione puntuale tramite alias.
- **Abbinamento per somiglianza dei nomi** (distanza tra stringhe): rischia abbinamenti sbagliati silenziosi, per esempio tra due squadre della stessa città.

## Conseguenze

- Le squadre non abbinate restano visibili come problemi di qualità. Il Data Center le mostra già tra i problemi aperti.
- Un alias sbagliato collega due squadre diverse. Per questo l'abbinamento richiede un alias univoco e un solo ID per provider.
- Test: `supabase/tests/football-cross-provider.test.ts` (database) e `services/data-collector/tests/test_api_football_backfill.py` (confronto dei nomi).
