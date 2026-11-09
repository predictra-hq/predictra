import "server-only";

/**
 * Fornitore LLM di Ask PREDICTRA (ADR 0042): endpoint compatibile OpenAI, chiamato
 * solo dal server con `fetch`. Oggi Groq (piano gratuito); l'interfaccia permette
 * di aggiungere la riserva (Cloudflare Workers AI) senza toccare il resto.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatResult {
  message: { content: string | null; tool_calls?: ToolCall[] };
  tokens: number;
}

/** Errori del fornitore che l'utente deve vedere con un messaggio chiaro. */
export class LlmError extends Error {
  constructor(
    readonly kind: "rate_limited" | "unavailable" | "bad_response",
    message: string,
  ) {
    super(message);
  }
}

export interface LlmProvider {
  readonly name: string;
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult>;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** Modello in produzione su Groq con supporto agli strumenti (docs Groq, 9/11/2026). */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

interface CompletionResponse {
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
  usage?: { total_tokens?: number };
}

export function groqProvider(apiKey: string, model = DEFAULT_GROQ_MODEL): LlmProvider {
  return {
    name: "Groq",
    async chat(messages, tools) {
      let response: Response;
      try {
        response = await fetch(GROQ_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            tools,
            tool_choice: "auto",
            parallel_tool_calls: false,
            reasoning_effort: "low",
            include_reasoning: false,
            max_completion_tokens: 1024,
          }),
          signal: AbortSignal.timeout(30_000),
          cache: "no-store",
        });
      } catch {
        throw new LlmError("unavailable", "Groq non raggiungibile");
      }
      // Mai il corpo della risposta d'errore nei log: potrebbe riportare parti della richiesta.
      if (response.status === 429) throw new LlmError("rate_limited", "Groq: limite raggiunto");
      if (!response.ok) throw new LlmError("unavailable", `Groq: HTTP ${response.status}`);
      const body = (await response.json().catch(() => null)) as CompletionResponse | null;
      const message = body?.choices?.[0]?.message;
      if (!message) throw new LlmError("bad_response", "Groq: risposta senza messaggio");
      return {
        message: { content: message.content ?? null, tool_calls: message.tool_calls },
        tokens: Math.max(0, Math.round(body?.usage?.total_tokens ?? 0)),
      };
    },
  };
}

/** Ask è attiva se c'è la chiave e nessuno l'ha spenta con `ASK_ENABLED=false`. */
export function askProvider(): LlmProvider | null {
  const key = process.env.GROQ_API_KEY;
  if (!key || process.env.ASK_ENABLED === "false") return null;
  return groqProvider(key, process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL);
}
