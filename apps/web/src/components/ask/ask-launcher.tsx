"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Maximize2, MessageCircleQuestion, X } from "lucide-react";
import { AskChat } from "@/components/ask/ask-chat";
import { getMessages } from "@/lib/i18n";

const m = getMessages().ask;

/**
 * Pulsante fisso «Chiedi a PREDICTRA»: apre la chat in un pannello sopra la pagina, senza
 * cambiare indirizzo. La conversazione resta finché non si ricarica la pagina, anche se
 * il pannello si chiude. Sulla pagina `/ask` il pulsante non compare (c'è già la chat).
 */
export function AskLauncher({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Cambiando pagina (es. un collegamento nella risposta) il pannello si chiude: lo stato
  // si aggiorna durante il rendering, senza un effetto in più.
  const [shownOn, setShownOn] = useState(pathname);
  if (shownOn !== pathname) {
    setShownOn(pathname);
    setOpen(false);
  }
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (pathname === "/ask") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-tour="ask"
        aria-label={m.title}
        title={m.title}
        // Telefono: nella barra in alto, accanto ad «Aggiorna», così non copre mai bottoni e
        // contenuti. Computer: pulsante tondo in basso a destra.
        className="fixed left-[5.75rem] top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 flex size-10 cursor-pointer items-center justify-center rounded-md text-positive transition-colors hover:bg-surface-2 lg:bottom-6 lg:left-auto lg:right-6 lg:top-auto lg:size-14 lg:rounded-full lg:border lg:border-positive/40 lg:bg-surface lg:shadow-lg lg:hover:bg-positive-soft"
      >
        <MessageCircleQuestion className="size-[22px] lg:size-6" aria-hidden />
      </button>
      <dialog
        ref={ref}
        aria-label={m.title}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="mb-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-[var(--radius-card)] border border-border bg-bg p-0 text-left text-fg shadow-xl backdrop:bg-black/50 sm:m-auto sm:max-h-[85dvh] sm:max-w-2xl sm:rounded-[var(--radius-card)]"
      >
        <div className="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{m.title}</h2>
              <p className="mt-0.5 text-xs text-subtle">{m.disclaimer}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/ask"
                aria-label={m.openFull}
                title={m.openFull}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <Maximize2 size={16} aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={m.close}
                className="cursor-pointer rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          {enabled ? <AskChat /> : <p className="text-sm text-muted">{m.disabled}</p>}
          <p className="text-xs text-subtle">{m.privacy}</p>
        </div>
      </dialog>
    </>
  );
}
