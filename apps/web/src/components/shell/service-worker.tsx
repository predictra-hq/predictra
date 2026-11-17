"use client";

import { useEffect } from "react";

/**
 * Registra il service worker della schermata «Sei offline» (ADR 0059). Solo nella build di
 * produzione (DEV e PROD su Vercel): in sviluppo locale confonderebbe il ricaricamento del codice.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Senza service worker l'app funziona come prima; offline compare l'errore del browser.
    });
  }, []);
  return null;
}
