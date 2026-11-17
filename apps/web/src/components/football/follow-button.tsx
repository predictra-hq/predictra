"use client";

import { Star } from "lucide-react";
import { useActionState } from "react";
import { setFollow } from "@/app/(app)/teams/follow-action";
import type { ActionState } from "@/lib/errors";
import type { FollowKind } from "@/lib/football/follow-input";
import { cn } from "@/lib/utils";

const INITIAL: ActionState = { ok: true, message: "" };

/**
 * Pulsante «Segui»: un modulo con Server Action, quindi funziona anche senza JavaScript.
 * I testi arrivano già tradotti dal server.
 */
export function FollowButton({
  kind,
  id,
  following,
  labels,
}: {
  kind: FollowKind;
  id: number;
  following: boolean;
  labels: { follow: string; following: string };
}) {
  const [state, action, pending] = useActionState(setFollow, INITIAL);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="follow" value={following ? "0" : "1"} />
      <button
        type="submit"
        aria-pressed={following}
        aria-busy={pending}
        disabled={pending}
        className={cn(
          "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60",
          following
            ? "border-warning/40 bg-warning-soft text-warning"
            : "border-border-strong text-muted hover:text-fg active:bg-surface-2",
        )}
      >
        <Star size={16} aria-hidden="true" fill={following ? "currentColor" : "none"} />
        {following ? labels.following : labels.follow}
      </button>
      {state && !state.ok && state.message ? (
        <p role="alert" className="text-xs text-negative-strong">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
