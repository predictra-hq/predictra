"use client";

import { useEffect, useRef } from "react";

/**
 * Sul telefono le tabelle diventano schede: ogni cella mostra a sinistra l'intestazione
 * della sua colonna (CSS `.stack-sm` in globals.css). Questo componente, messo dentro il
 * contenitore della tabella, copia il testo delle intestazioni nell'attributo
 * `data-label` delle celle, anche quando le righe cambiano dopo un filtro.
 * Non mostra nulla e non cambia il contenuto: senza JavaScript la tabella scorre di lato.
 */
export function TableLabels() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const label = () => {
      for (const table of box.querySelectorAll("table")) {
        const heads: string[] = [];
        for (const th of table.querySelectorAll<HTMLTableCellElement>("thead tr:last-child th")) {
          const text = (th.textContent ?? "").trim();
          for (let i = 0; i < (th.colSpan || 1); i++) heads.push(text);
        }
        for (const row of table.querySelectorAll("tbody tr")) {
          let column = 0;
          for (const cell of row.children) {
            const span = cell instanceof HTMLTableCellElement ? cell.colSpan || 1 : 1;
            const text = span === 1 ? (heads[column] ?? "") : "";
            if (text && cell.getAttribute("data-label") !== text) {
              cell.setAttribute("data-label", text);
            }
            column += span;
          }
        }
      }
    };
    label();
    // Solo nodi aggiunti o tolti: le modifiche agli attributi non riattivano il controllo.
    const observer = new MutationObserver(label);
    observer.observe(box, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <span ref={ref} hidden />;
}
