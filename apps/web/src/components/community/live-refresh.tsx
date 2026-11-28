"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

/** Attesa prima di ricaricare: più avvisi ravvicinati (es. reazioni) fanno un solo aggiornamento. */
const DEBOUNCE_MS = 400;
/** Dopo un errore di collegamento si riprova con questa attesa. */
const RETRY_MS = 15_000;

/**
 * Spogliatoio in tempo reale (ADR 0081): ascolta il canale Broadcast privato `topic` e,
 * quando arriva «qualcosa è cambiato», ricarica la chat dal server (`router.refresh`).
 * L'avviso non contiene testo né nomi: i messaggi passano sempre da `community_feed`.
 *
 * Senza collegamento (rete, sessione scaduta, Realtime non disponibile) la chat si
 * aggiorna comunque quando si torna sulla pagina, e il collegamento si riprova.
 */
export function LiveRefresh({
  topic,
  labels,
}: {
  topic: string;
  labels: { live: string; offline: string };
}) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const supabase = browserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const connect = async () => {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLive(false);
        return;
      }
      await supabase.realtime.setAuth(token);
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "changed" }, refresh)
        .subscribe((status: string) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setLive(true);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setLive(false);
            if (channel) void supabase.removeChannel(channel);
            channel = null;
            retry ??= setTimeout(() => {
              retry = null;
              void connect();
            }, RETRY_MS);
          }
        });
    };

    // Tornando sulla pagina: messaggi arrivati nel frattempo e, se serve, nuovo collegamento.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      if (!channel && !retry) void connect();
    };

    void connect();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (retry) clearTimeout(retry);
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic, router]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        live ? "text-positive-strong" : "text-subtle",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          live ? "bg-positive motion-safe:animate-pulse" : "bg-subtle",
        )}
      />
      {live ? labels.live : labels.offline}
    </span>
  );
}
