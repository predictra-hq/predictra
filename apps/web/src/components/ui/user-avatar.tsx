import { avatarColor } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";

/**
 * Avatar predefinito: simbolo di PREDICTRA (linea di andamento e pallone) in bianco su un
 * cerchio del colore dell'utente. Decorativo: accanto c'è sempre il nome scritto.
 */
export function UserAvatar({
  userId,
  color,
  className,
}: {
  userId: string;
  /** Colore scelto (`profiles.avatar_color`); senza, quello automatico. */
  color?: string | null;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={cn("size-10 shrink-0 rounded-full", className)}
    >
      <circle cx="20" cy="20" r="20" fill={avatarColor(userId, color)} />
      <polyline
        points="8,29 15,21.5 21.5,25.5 29.5,15"
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="30.5" cy="12" r="4" fill="#fff" />
    </svg>
  );
}
