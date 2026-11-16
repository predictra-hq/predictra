"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { APP_VERSION, isNewerDeploy, VERSION_CHECK_INTERVAL_MS } from "@/lib/version";

/**
 * Avviso "nuova versione disponibile". Dopo un deploy la pagina già aperta (soprattutto
 * l'app installata sul telefono, che resta aperta per giorni) continua a usare il codice
 * vecchio: qui si chiede ogni tanto al server la versione pubblicata e, se è cambiata, si
 * propone di ricaricare. Non ricarica da solo, per non far perdere un modulo in compilazione.
 */
export function UpdateNotice({ labels }: { labels: { message: string; action: string } }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        // Sessione scaduta: il proxy risponde con la pagina di accesso, non con JSON.
        if (!response.ok || !response.headers.get("content-type")?.includes("json")) return;
        const body: { version?: unknown } = await response.json();
        if (active && isNewerDeploy(APP_VERSION, body.version)) setAvailable(true);
      } catch {
        // Rete assente: si riprova al prossimo controllo.
      }
    };
    const timer = window.setInterval(check, VERSION_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!available) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-30 flex items-center justify-between gap-3 rounded-lg border border-positive/40 bg-surface px-4 py-3 text-sm shadow-lg lg:inset-x-auto lg:bottom-6 lg:right-6 lg:max-w-sm"
    >
      <span>{labels.message}</span>
      <Button className="h-9 shrink-0 px-3" onClick={() => window.location.reload()}>
        <RefreshCw size={14} aria-hidden="true" />
        {labels.action}
      </Button>
    </div>
  );
}
