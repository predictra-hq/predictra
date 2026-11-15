## Cosa cambia

<!-- Milestone, corsia e fase del piano (es. "M2 · corsia A · fase A2"), poi cosa fa la PR in due righe. -->

Milestone / corsia / fase:

## Controlli

- [ ] Branch partito da `dev` aggiornato, nome `feature/m<N>-<0|a|b>-<slug>` o `feature/docs-<slug>`
- [ ] Tocca solo i file della propria corsia (altrimenti spiegato qui sotto e concordato nella issue)
- [ ] Migrazioni: solo file nuovi, timestamp successivo all'ultimo già su `dev`
- [ ] Nessun segreto nel codice o nei log, nessun dato inventato (eventuali dati di prova etichettati `DEMO`)
- [ ] Documentazione aggiornata dove serve (ADR, data dictionary, setup, roadmap)
- [ ] CI verde
- [ ] Il merge lo fa `gennpalm` con _Create a merge commit_; dopo il merge GitHub cancella il branch e il lavoro successivo riparte da `dev` con un branch nuovo

## Note per chi lavora sull'altra corsia

<!-- Cambi al contratto, nuove variabili d'ambiente o segreti richiesti, file condivisi toccati. Scrivi "nessuna" se non ce ne sono. -->
