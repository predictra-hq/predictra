"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import type { Messages } from "@/lib/i18n";
import { confirmTotpEnrollment, startTotpEnrollment, type EnrollResult } from "./actions";

export function TotpEnrollment({ messages }: { messages: Messages }) {
  const m = messages;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enrollment, setEnrollment] = useState<EnrollResult | null>(null);
  const [result, setResult] = useState<EnrollResult | null>(null);
  const [code, setCode] = useState("");

  if (!enrollment?.ok) {
    return (
      <div className="flex flex-col gap-3">
        {enrollment && !enrollment.ok ? <Alert tone="negative">{enrollment.message}</Alert> : null}
        <Button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setEnrollment(await startTotpEnrollment()))}
          className="self-start"
        >
          {m.security.mfaEnroll}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{m.security.mfaScan}</p>
      {enrollment.qrCode ? (
        // QR fornito da Supabase come data URI SVG.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={enrollment.qrCode}
          alt="QR code TOTP"
          width={180}
          height={180}
          className="rounded-lg bg-white p-2"
        />
      ) : null}
      <div>
        <p className="text-xs text-muted">{m.security.mfaSecret}</p>
        <code className="mt-1 block break-all rounded-md bg-bg px-2 py-1 font-mono text-sm">
          {enrollment.secret}
        </code>
      </div>
      <form
        className="flex flex-col gap-3 sm:max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (!enrollment.factorId) return;
          const factorId = enrollment.factorId;
          startTransition(async () => {
            const res = await confirmTotpEnrollment(factorId, code);
            setResult(res);
            if (res.ok) router.refresh();
          });
        }}
      >
        <Field label={m.auth.mfaCode} htmlFor="totp-code">
          <Input
            id="totp-code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </Field>
        <Button type="submit" disabled={pending || code.length !== 6}>
          {m.security.mfaConfirm}
        </Button>
        <div aria-live="polite">
          {result ? (
            <Alert tone={result.ok ? "positive" : "negative"}>{result.message}</Alert>
          ) : null}
        </div>
      </form>
    </div>
  );
}
