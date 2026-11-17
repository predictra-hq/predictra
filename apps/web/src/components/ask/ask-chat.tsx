"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { MessageCircleQuestion, Sparkles } from "lucide-react";
import { ask, type AskState } from "@/app/(app)/ask/actions";
import { Alert, Button, Card, CardTitle, Label, ScrollRegion } from "@/components/ui/primitives";
import { RowLimitClient } from "@/components/ui/row-limit";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { parseRichText, type RichSpan } from "@/lib/ask/rich-text";
import type { ToolOutput } from "@/lib/ask/tools";

const m = getMessages().ask;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? m.sending : m.send}
    </Button>
  );
}

function SourceTable({ source }: { source: ToolOutput }) {
  const columns = Object.keys(source.rows[0] ?? {}).filter((c) => c !== "match_id");
  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-fg">{source.title}</p>
      {source.source ? <p className="text-xs text-subtle">{source.source}</p> : null}
      <ScrollRegion label={source.title} className="mt-2">
        <RowLimitClient
          total={source.rows.length}
          limit={5}
          more={getMessages().common.showMoreRows}
          less={getMessages().common.showLessRows}
        >
          <table className="w-full min-w-max text-left text-xs">
            <caption className="sr-only">{source.title}</caption>
            <thead className="text-muted">
              <tr>
                {columns.map((c) => (
                  <th key={c} scope="col" className="py-1 pr-4 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {source.rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {columns.map((c) => (
                    <td key={c} className="py-1 pr-4 tabular-nums text-fg">
                      {row[c]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </RowLimitClient>
      </ScrollRegion>
    </div>
  );
}

function Spans({ spans }: { spans: readonly RichSpan[] }) {
  return spans.map((span, i) =>
    span.bold ? (
      <strong key={i} className="font-semibold">
        {span.text}
      </strong>
    ) : (
      <span key={i}>{span.text}</span>
    ),
  );
}

/** Risposta con grassetto ed elenchi veri, non asterischi a vista. */
function Answer({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-[0.9375rem] leading-relaxed text-fg">
      {parseRichText(text).map((block, i) =>
        block.type === "list" ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-positive">
            {block.items.map((item, j) => (
              <li key={j}>
                <Spans spans={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Spans spans={block.spans} />
          </p>
        ),
      )}
    </div>
  );
}

function Exchange({ item }: { item: AskState }) {
  return (
    <li className="flex flex-col gap-2">
      <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-positive-soft px-3.5 py-2 text-sm text-fg">
        <span className="sr-only">{m.you}: </span>
        {item.question}
      </p>
      <Card className="p-4">
        <p className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-muted">
          <Sparkles className="size-3.5" aria-hidden />
          {m.assistant}
        </p>
        {item.answer ? <Answer text={item.answer} /> : null}
        {item.notice ? (
          <Alert tone={item.tone} className="mt-1">
            {item.notice}
          </Alert>
        ) : null}
        {item.sources.length > 0 ? (
          <details className="mt-3" open={!item.answer}>
            <summary className="cursor-pointer text-xs font-medium text-muted">{m.sources}</summary>
            {item.sources.map((s, i) => (
              <SourceTable key={i} source={s} />
            ))}
          </details>
        ) : item.answer ? (
          <p className="mt-2 text-xs text-subtle">{m.noSources}</p>
        ) : null}
      </Card>
    </li>
  );
}

export function AskChat() {
  const [question, setQuestion] = useState("");
  const [history, formAction] = useActionState(async (prev: AskState[], formData: FormData) => {
    const result = await ask(null, formData);
    setQuestion("");
    return [...prev, result];
  }, []);
  const endRef = useRef<HTMLDivElement>(null);
  const last = history.at(-1);

  useEffect(() => {
    if (history.length > 0) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [history.length]);

  return (
    <div className="flex flex-col gap-4">
      {history.length > 0 ? (
        <section aria-label={m.history}>
          <ol className="flex flex-col gap-4" aria-live="polite">
            {history.map((item, i) => (
              <Exchange key={i} item={item} />
            ))}
          </ol>
          <div ref={endRef} />
        </section>
      ) : (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleQuestion className="size-4" aria-hidden />
            {m.examples}
          </CardTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {m.exampleItems.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm text-fg transition-colors hover:border-positive/40 active:bg-border"
                  onClick={() => setQuestion(example)}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form action={formAction} className="flex flex-col gap-2">
        <Label htmlFor="question">{m.question}</Label>
        <textarea
          id="question"
          name="question"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={m.placeholder}
          className="w-full rounded-xl border border-input bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted" aria-live="polite">
            {last?.remaining !== null && last?.remaining !== undefined
              ? fillTemplate(m.remaining, { n: last.remaining })
              : null}
          </p>
          <Submit />
        </div>
      </form>
    </div>
  );
}
