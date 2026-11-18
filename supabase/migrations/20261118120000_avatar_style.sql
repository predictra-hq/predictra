-- =============================================================================
-- PREDICTRA — M8: immagine del profilo per tipo, sempre nel colore del sito
-- =============================================================================
-- Dizionario: docs/data-dictionary/identity.md
--
-- Prima l'utente sceglieva il colore del cerchio (`avatar_color`). Il proprietario
-- preferisce che l'immagine resti nel verde di PREDICTRA e che cambi solo il tipo di
-- disegno. La colonna diventa `avatar_style`; i colori scelti finora non hanno un tipo
-- corrispondente e tornano al predefinito («classico»).
-- =============================================================================

alter table public.profiles drop constraint profiles_avatar_color_check;
update public.profiles set avatar_color = null where avatar_color is not null;
alter table public.profiles rename column avatar_color to avatar_style;
alter table public.profiles
  add constraint profiles_avatar_style_check
  check (avatar_style in ('classic', 'outline', 'ball', 'line', 'initial'));
