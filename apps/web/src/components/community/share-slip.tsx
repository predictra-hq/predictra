"use client";

import { useActionState, useState } from "react";
import { Send, Share2, Users } from "lucide-react";
import { shareSlip } from "@/app/(app)/locker-room/actions";
import { SubmitButton } from "@/components/ui/form";
import { Alert, Button } from "@/components/ui/primitives";

export interface ShareSlipLabels {
  share: string;
  toCommunity: string;
  toApps: string;
  messagePlaceholder: string;
  send: string;
  copied: string;
  seeChat: string;
}

/**
 * Condividi una schedina (ADR 0064): nella chat «Schedine» della comunità, con un
 * messaggio facoltativo, oppure con le altre app del telefono (WhatsApp, Telegram…) come
 * testo. Senza la condivisione di sistema il testo si copia negli appunti.
 */
export function ShareSlip({
  slip,
  text,
  labels,
}: {
  /** Schedina in JSON (riepilogo da mostrare, ricontrollato dal server). */
  slip: string;
  /** Testo pronto per le altre app. */
  text: string;
  labels: ShareSlipLabels;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action] = useActionState(shareSlip, null);

  async function toApps() {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* condivisione annullata: niente da fare */
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-muted">
          <Share2 size={13} aria-hidden="true" />
          {labels.share}
        </span>
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 text-xs"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Users size={14} aria-hidden="true" />
          {labels.toCommunity}
        </Button>
        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={toApps}>
          <Send size={14} aria-hidden="true" />
          {labels.toApps}
        </Button>
      </div>
      {copied ? <p className="mt-2 text-xs text-positive-strong">{labels.copied}</p> : null}
      {open ? (
        <form action={action} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="slip" value={slip} />
          <textarea
            name="body"
            maxLength={500}
            rows={2}
            placeholder={labels.messagePlaceholder}
            className="w-full rounded-xl border border-input bg-bg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30"
          />
          <SubmitButton className="self-start">{labels.send}</SubmitButton>
          {state ? (
            <Alert tone={state.ok ? "positive" : "negative"}>
              {state.message}{" "}
              {state.ok ? (
                <a href="/locker-room?c=slips" className="font-medium underline">
                  {labels.seeChat}
                </a>
              ) : null}
            </Alert>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
