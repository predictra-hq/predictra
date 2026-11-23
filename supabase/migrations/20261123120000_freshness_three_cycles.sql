-- Freschezza delle partite adatta ai tre giri al giorno dell'agente (ADR 0061, 0065).
-- Con gli avvii alle 6:50, 15:50 e 22:50 UTC tra due raccolte passano fino a 9 ore: con
-- la soglia di 6 ore la fonte risultava «degradata» ogni notte e ogni mattina anche se
-- l'ultima raccolta era andata bene.
update public.source_freshness_rules
set max_age = interval '10 hours'
where provider = 'football-data-org' and data_kind = 'matches';
