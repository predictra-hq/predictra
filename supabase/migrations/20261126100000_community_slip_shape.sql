-- Schedine condivise nello Spogliatoio (ADR 0064, 0070, 0075): forma controllata anche nel
-- database. Prima il vincolo guardava solo che `slip` fosse un oggetto sotto i 4 KB: un utente
-- attivo poteva scrivere direttamente (PostgREST con il proprio JWT) `{"picks": 1}` e la
-- pagina dello Spogliatoio e la card in Home andavano in errore per tutti.
--
-- Come `parseSharedSlip` (apps/web/src/lib/community/slip.ts): titolo di 1–60 caratteri,
-- da 1 a 12 giocate, ognuna con partita e giocata in testo. `not valid`: i messaggi già
-- scritti restano, l'app scarta in lettura quelli non conformi.
alter table public.community_posts
  add constraint community_posts_slip_shape check (
    slip is null
    -- coalesce: un campo mancante dà NULL, e un CHECK con NULL passerebbe.
    or coalesce(
      jsonb_typeof(slip -> 'title') = 'string'
      and char_length(btrim(slip ->> 'title')) between 1 and 60
      -- case: l'ordine delle condizioni di un AND non è garantito, e la lunghezza di un
      -- valore che non è un array è un errore.
      and case
        when jsonb_typeof(slip -> 'picks') = 'array'
          then jsonb_array_length(slip -> 'picks') between 1 and 12
        else false
      end
      and not jsonb_path_exists(
        slip,
        '$.picks[*] ? (@.type() != "object" || !exists(@.match) || !exists(@.pick) || @.match.type() != "string" || @.pick.type() != "string")'
      )
      and (not slip ? 'price' or jsonb_typeof(slip -> 'price') in ('number', 'null'))
      and (not slip ? 'probability' or jsonb_typeof(slip -> 'probability') in ('number', 'null')),
      false
    )
  ) not valid;
