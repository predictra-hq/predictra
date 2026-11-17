import { nameClasses } from "@/lib/community/community";
import { cn } from "@/lib/utils";

/** Nome utente con il colore e la scritta scelti nelle Preferenze (elenchi chiusi). */
export function StyledName({
  name,
  color,
  style,
  className,
}: {
  name: string;
  color: string | null;
  style: string | null;
  className?: string;
}) {
  return <span className={cn("font-medium", nameClasses(color, style), className)}>{name}</span>;
}
