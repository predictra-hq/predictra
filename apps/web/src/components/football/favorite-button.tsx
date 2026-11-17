import { Star } from "lucide-react";
import { setFavoriteCompetition } from "@/app/(app)/match-center/favorite-action";
import { getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Stella accanto al filtro: rende il campionato mostrato quello che si apre di solito. */
export function FavoriteCompetitionButton({
  code,
  isFavorite,
}: {
  code: string;
  isFavorite: boolean;
}) {
  const m = getMessages().matchCenter;
  return (
    <form action={setFavoriteCompetition} className="mb-4">
      {/* Con il preferito già attivo il clic lo toglie: si invia un codice vuoto. */}
      <input type="hidden" name="code" value={isFavorite ? "" : code} />
      <input type="hidden" name="current" value={code} />
      <button
        type="submit"
        aria-pressed={isFavorite}
        title={m.favoriteHint}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          isFavorite ? "text-warning" : "text-muted hover:text-fg",
        )}
      >
        <Star size={14} aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
        {isFavorite ? m.favoriteOn : m.favoriteOff}
      </button>
    </form>
  );
}
