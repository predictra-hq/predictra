"use server";

import { z } from "zod";
import { ASK_QUOTA_EXCEEDED } from "@predictra/shared-types";
import { askProvider, LlmError } from "@/lib/ask/provider";
import { askQuestion } from "@/lib/ask/run";
import type { ToolOutput } from "@/lib/ask/tools";
import { requireUser } from "@/lib/auth/dal";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { createClient } from "@/lib/supabase/server";

export interface AskState {
  question: string;
  answer: string | null;
  /** Messaggio al posto della risposta (quota, errori, risposta scartata). */
  notice: string | null;
  tone: "neutral" | "warning" | "negative";
  sources: ToolOutput[];
  remaining: number | null;
}

const questionSchema = z.string().trim().min(3).max(500);

/*
 * Ask PREDICTRA (ADR 0042): quota nel database, LLM solo lato server, nessun testo
 * salvato. Il controllo sui numeri scarta le risposte con numeri non presenti nei dati.
 */
export async function ask(_prev: AskState | null, formData: FormData): Promise<AskState> {
  const m = getMessages().ask;
  await requireUser();
  const fail = (
    question: string,
    notice: string,
    tone: AskState["tone"] = "negative",
  ): AskState => ({
    question,
    answer: null,
    notice,
    tone,
    sources: [],
    remaining: null,
  });

  const parsed = questionSchema.safeParse(formData.get("question"));
  if (!parsed.success) return fail("", m.invalid, "warning");
  const question = parsed.data;

  const provider = askProvider();
  if (!provider) return fail(question, m.disabled, "warning");

  const supabase = await createClient();
  const { data: remaining, error: quotaError } = await supabase.rpc("ask_consume");
  if (quotaError) {
    return quotaError.message?.includes(ASK_QUOTA_EXCEEDED)
      ? fail(question, m.quotaExceeded, "warning")
      : fail(question, getMessages().common.genericError);
  }

  try {
    const result = await askQuestion(provider, question);
    const rejected = result.answer === null && result.rejectedNumbers.length > 0;
    await supabase.rpc("ask_record", { p_tokens: result.tokens, p_rejected: rejected });
    return {
      question,
      answer: result.answer,
      notice: rejected
        ? fillTemplate(m.rejected, { numbers: result.rejectedNumbers.join(", ") })
        : result.answer === null
          ? m.noAnswer
          : null,
      tone: rejected ? "warning" : "neutral",
      sources: result.sources,
      remaining: Number(remaining),
    };
  } catch (error) {
    const notice =
      error instanceof LlmError && error.kind === "rate_limited" ? m.rateLimited : m.unavailable;
    return { ...fail(question, notice, "warning"), remaining: Number(remaining) };
  }
}
