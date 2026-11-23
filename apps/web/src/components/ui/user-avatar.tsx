import { avatarInitial, avatarStyleOf } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";

/** Linea di andamento del simbolo, la stessa del logo (`components/shell/logo.tsx`). */
const LINE = "8,29 15,21.5 21.5,25.5 29.5,15";

/**
 * Immagine del profilo: il simbolo di PREDICTRA nel verde del sito, nel tipo scelto in
 * _Profilo → Il tuo profilo_ (`profiles.avatar_style`). Decorativa: accanto c'è sempre il
 * nome scritto.
 */
export function UserAvatar({
  style,
  name,
  className,
}: {
  /** Tipo scelto (`profiles.avatar_style`); senza, il classico. */
  style?: string | null;
  /** Nome per il tipo con l'iniziale. */
  name?: string | null;
  className?: string;
}) {
  const kind = avatarStyleOf(style);
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={cn("size-10 shrink-0 rounded-full", className)}
    >
      {kind === "classic" ? (
        <>
          <circle cx="20" cy="20" r="20" className="fill-positive" />
          <polyline
            points={LINE}
            fill="none"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-on-positive"
          />
          <circle cx="30.5" cy="12" r="4" className="fill-on-positive" />
        </>
      ) : null}
      {kind === "outline" ? (
        <>
          <circle
            cx="20"
            cy="20"
            r="18.5"
            strokeWidth="3"
            className="fill-surface stroke-positive"
          />
          <polyline
            points={LINE}
            fill="none"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-positive"
          />
          <circle cx="30.5" cy="12" r="4" className="fill-fg" />
        </>
      ) : null}
      {kind === "ball" ? (
        <>
          <circle cx="20" cy="20" r="20" className="fill-positive-soft" />
          <circle cx="20" cy="20" r="19.5" fill="none" className="stroke-positive/40" />
          <polyline
            points="4,32 13,24 20,28 36,13"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-positive/50"
          />
          <circle cx="20" cy="18" r="8.5" className="fill-positive" />
        </>
      ) : null}
      {kind === "line" ? (
        <>
          <circle cx="20" cy="20" r="20" className="fill-surface-2" />
          <polyline
            points="7,28 14,19 21,24 33,11"
            fill="none"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-positive"
          />
        </>
      ) : null}
      {kind === "initial" ? (
        <>
          <circle cx="20" cy="20" r="20" className="fill-positive" />
          <text
            x="18"
            y="27"
            textAnchor="middle"
            fontSize="20"
            fontWeight="700"
            className="fill-on-positive"
          >
            {avatarInitial(name)}
          </text>
          <circle cx="31" cy="11" r="4" className="fill-on-positive" />
        </>
      ) : null}
    </svg>
  );
}
