import type { ReactNode } from "react";

/**
 * Next.js rimonta il template a ogni cambio di pagina: qui serve solo a far entrare il
 * contenuto con una dissolvenza breve (`.page-enter` in globals.css), al posto del taglio
 * netto. Con "riduci movimento" attivo l'animazione è di fatto assente.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
