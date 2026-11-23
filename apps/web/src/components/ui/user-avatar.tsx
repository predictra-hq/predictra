import { avatarInitial, avatarStyleOf } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";

/** Disegno del logo (`components/shell/logo.tsx`, `app/icon.svg`): stessa linea, stesso pallone. */
const LINE = "6,23 12,16.5 17,20 23.5,11";
const BALL = { cx: 24.5, cy: 9.5, r: 3.4 } as const;

function Trend({ className, width = 2.8 }: { className: string; width?: number }) {
  return (
    <polyline
      points={LINE}
      fill="none"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    />
  );
}

/**
 * Immagine del profilo (ADR 0064): il simbolo di PREDICTRA, lo stesso quadrato arrotondato,
 * la stessa linea e lo stesso pallone del logo, in cinque versioni scelte in _Profilo → Il
 * tuo profilo_ (`profiles.avatar_style`). La vedono tutti accanto al nome; decorativa,
 * perché il nome è sempre scritto vicino.
 */
export function UserAvatar({
  style,
  name,
  className,
}: {
  /** Tipo scelto (`profiles.avatar_style`); senza, il logo. */
  style?: string | null;
  /** Nome per il tipo con l'iniziale. */
  name?: string | null;
  className?: string;
}) {
  const kind = avatarStyleOf(style);
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-10 shrink-0 rounded-[22%]", className)}
    >
      {kind === "classic" ? (
        <>
          {/* Il logo, identico. */}
          <rect width="32" height="32" rx="7" className="fill-surface" />
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="6.5"
            fill="none"
            className="stroke-border-strong"
          />
          <Trend className="stroke-positive" />
          <circle {...BALL} className="fill-fg" />
        </>
      ) : null}
      {kind === "outline" ? (
        <>
          {/* Logo in negativo: fondo verde, linea e pallone chiari. */}
          <rect width="32" height="32" rx="7" className="fill-positive" />
          <Trend className="stroke-on-positive" />
          <circle {...BALL} className="fill-on-positive" />
        </>
      ) : null}
      {kind === "ball" ? (
        <>
          {/* Il pallone in primo piano, la linea dietro. */}
          <rect width="32" height="32" rx="7" className="fill-positive-soft" />
          <Trend className="stroke-positive/45" />
          <circle cx="24.5" cy="9.5" r="5" className="fill-positive" />
          <circle cx="24.5" cy="9.5" r="2" className="fill-on-positive" />
        </>
      ) : null}
      {kind === "line" ? (
        <>
          {/* Solo l'andamento, più marcato, su fondo scuro. */}
          <rect width="32" height="32" rx="7" className="fill-fg" />
          <Trend className="stroke-positive" width={3.6} />
          <circle {...BALL} className="fill-bg" />
        </>
      ) : null}
      {kind === "initial" ? (
        <>
          {/* L'iniziale del nome al posto della linea, con il pallone del logo. */}
          <rect width="32" height="32" rx="7" className="fill-surface" />
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="6.5"
            fill="none"
            className="stroke-positive"
          />
          <text
            x="14"
            y="23"
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            className="fill-positive"
          >
            {avatarInitial(name)}
          </text>
          <circle {...BALL} className="fill-fg" />
        </>
      ) : null}
    </svg>
  );
}
