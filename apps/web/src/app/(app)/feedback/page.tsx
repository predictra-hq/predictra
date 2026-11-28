import type { Metadata } from "next";
import { HandHeart } from "lucide-react";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  isFeedbackKind,
  type FeedbackKind,
} from "@predictra/shared-types";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Badge, Card, CardTitle, Label, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { donationUrl } from "@/lib/env";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { sendFeedback } from "./actions";

export const metadata: Metadata = { title: getMessages().pageTitles.feedback };

interface OwnFeedback {
  id: number;
  kind: FeedbackKind;
  body: string;
  created_at: string;
}

/** Percorso interno da cui si arriva (`?from=/locker-room`), per capire a cosa si riferisce. */
function fromPath(raw: unknown): string {
  return typeof raw === "string" && /^\/(?!\/)[^\s]{0,199}$/.test(raw) ? raw : "";
}

/**
 * Feedback e sostegno (ADR 0081): l'iscritto manda un'idea, un problema o un
 * apprezzamento, che leggono gli amministratori (Amministrazione → Feedback), e rivede
 * quelli già mandati. Se il proprietario ha impostato `DONATION_URL`, un riquadro
 * permette di sostenere PREDICTRA con una donazione su un sito esterno.
 */
export default async function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  const user = await requireUser();
  const m = getMessages();
  const f = m.feedback;
  const from = fromPath((await searchParams).from);
  const supabase = await createClient();
  const { data } = await supabase
    .from("feedback")
    .select("id, kind, body, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const own = ((data ?? []) as OwnFeedback[]).filter((x) => isFeedbackKind(x.kind));
  const donation = donationUrl();

  return (
    <>
      <PageHeader title={f.title} description={f.description} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{f.formTitle}</CardTitle>
          <p className="mb-4 mt-1 text-sm text-muted">{f.formHint}</p>
          <ActionForm action={sendFeedback}>
            <input type="hidden" name="page" value={from} />
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{f.kindLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_KINDS.map((k, i) => (
                  <label
                    key={k}
                    className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-positive has-[:checked]:bg-positive-soft has-[:checked]:text-positive-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-positive"
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={k}
                      defaultChecked={i === 0}
                      className="sr-only"
                    />
                    {f.kinds[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <Label htmlFor="feedback-body">{f.bodyLabel}</Label>
              <textarea
                id="feedback-body"
                name="body"
                required
                minLength={3}
                maxLength={FEEDBACK_MAX_LENGTH}
                rows={5}
                placeholder={f.placeholder}
                className="mt-1 w-full rounded-xl border border-input bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30"
              />
            </div>
            <SubmitButton>{f.send}</SubmitButton>
          </ActionForm>
          <p className="mt-3 text-xs text-subtle">{f.privacy}</p>
        </Card>

        <div className="flex flex-col gap-4">
          {donation ? (
            <Card>
              <CardTitle className="flex items-center gap-2">
                <HandHeart size={18} aria-hidden="true" className="text-positive" />
                {f.donateTitle}
              </CardTitle>
              <p className="mb-4 mt-1 text-sm text-muted">{f.donateText}</p>
              <a
                href={donation}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-positive px-4 text-sm font-medium text-on-positive transition-[filter] hover:brightness-95 active:brightness-90"
              >
                {f.donateButton}
              </a>
              <p className="mt-3 text-xs text-subtle">{f.donateNote}</p>
            </Card>
          ) : null}

          <Card>
            <CardTitle className="mb-3">{f.ownTitle}</CardTitle>
            {own.length === 0 ? (
              <p className="text-sm text-muted">{f.ownEmpty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {own.map((x) => (
                  <li key={x.id} className="py-2.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Badge tone={x.kind === "PROBLEM" ? "warning" : "positive"}>
                        {f.kinds[x.kind]}
                      </Badge>
                      <time dateTime={x.created_at} className="text-xs text-subtle">
                        {formatDateTime(x.created_at)}
                      </time>
                    </div>
                    <p className="whitespace-pre-line break-words text-sm">{x.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
