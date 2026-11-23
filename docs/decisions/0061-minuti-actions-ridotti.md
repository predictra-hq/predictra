# ADR 0061 — Meno minuti di GitHub Actions

- **Stato:** accettato (23/11/2026, richiesta del proprietario)
- **Milestone:** M8 (hardening)

## Contesto

Il piano gratuito dà 2.000 minuti al mese sui repository privati ($12 di consumo incluso). Il 23/11 ne restavano circa $1 (circa 170 minuti) fino al rinnovo del 1° dicembre. Misura dei job dal 1/11:

| Voce                                                | Minuti fatturati | Note                                                           |
| --------------------------------------------------- | ---------------- | -------------------------------------------------------------- |
| CI (lint, test, build, deploy) su push e PR         | 2.652            | circa 8 minuti a push; i job separati si arrotondano al minuto |
| Agente                                              | 474              | 7 cicli al giorno, la maggior parte senza lavoro               |
| Verifica DEV                                        | 240              | avviata a mano durante lo sviluppo                             |
| Motore, raccolte, backup, copia su DEV, Bet Builder | 368              |                                                                |

Senza sviluppo il sistema consumava circa 36 minuti al giorno: più di 1.000 al mese solo per restare acceso.

## Decisione

1. **Agente: tre cicli al giorno.** Niente più schedule di GitHub (ogni 3 ore, spesso in ritardo e compensato da QStash). Lo avvia solo QStash, alle fasce `CYCLE_SLOTS_UTC` (06:50, 15:50, 22:50 UTC): quote e previsioni del mattino, quote pre-partita e previsioni del pomeriggio, risultati della sera. Le finestre dei job (`odds`, `predictions`, `bet_builder`) restano le stesse.
2. **Backup e copia su DEV:** lunedì e giovedì invece che ogni giorno; la prova di ripristino resta il 1° del mese.
3. **CI:** la scansione dei segreti diventa un passo del job principale (un job in meno da arrotondare); la build si fa solo sulle PR, perché sui push la rifà già il deploy; anche i file `.md` fuori da `docs/` non fanno partire la CI.
4. **Passaggio dev → main senza doppioni** (aggiunta del 23/11/2026): la CI completa gira sulla PR verso `main`, sul codice già unito; al merge si fa solo il deploy di PROD. I controlli dei servizi Python e degli script (agente, motore, raccolte, Bet Builder, backup, Verifica) girano solo su PR e push verso `dev`. Un rilascio passa da circa 19 a circa 7 minuti.
5. **Verifica DEV:** solo quando serve davvero (cambi grossi all'interfaccia o all'accesso), non a ogni modifica.

## Stima

Agente circa 11 minuti al giorno (3 cicli), backup e copia circa 1,5: circa 380 minuti al mese di funzionamento, più lo sviluppo (circa 6 minuti a push invece di 8).

## Alternative

- **Repository pubblico:** i minuti di Actions sui repository pubblici sono gratuiti e illimitati. I segreti restano protetti, ma il codice diventa visibile a tutti: decisione del proprietario.
- **Runner self-hosted** su un computer sempre acceso: minuti gratis, ma serve una macchina accesa.
