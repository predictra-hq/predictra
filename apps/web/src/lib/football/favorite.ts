import { cookies } from "next/headers";
import { parseCompetitionCode } from "./format";

/*
 * Campionato preferito: quello che Partite e Campionati aprono quando non se ne sceglie
 * uno. Resta in un cookie di questo browser: non è un dato personale e non richiede
 * modifiche al database. Per averlo su tutti i dispositivi servirebbe una colonna in
 * `user_preferences`, cioè una modifica al contratto con una PR dedicata.
 */
export const FAVORITE_COMPETITION_COOKIE = "predictra-campionato";

/** Codice della competizione preferita, se impostato e valido. */
export async function readFavoriteCompetition(): Promise<string | null> {
  return parseCompetitionCode((await cookies()).get(FAVORITE_COMPETITION_COOKIE)?.value);
}

/** La competizione da mostrare: quella richiesta, poi la preferita, poi la prima. */
export function chooseCompetition<T extends { code: string | null }>(
  competitions: readonly T[],
  requested: string | null,
  favorite: string | null,
): T | undefined {
  return (
    competitions.find((c) => c.code !== null && c.code === requested) ??
    competitions.find((c) => c.code !== null && c.code === favorite) ??
    competitions[0]
  );
}
