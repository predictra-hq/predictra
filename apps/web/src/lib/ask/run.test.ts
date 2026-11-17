import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, LlmProvider } from "./provider";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/certainties/load", () => ({ loadHomeCertainties: vi.fn() }));

const { askQuestion } = await import("./run");

/** Fornitore finto: restituisce in ordine le risposte preparate e registra i messaggi. */
function fakeProvider(replies: ChatMessage[]): LlmProvider & { seen: ChatMessage[][] } {
  const seen: ChatMessage[][] = [];
  return {
    seen,
    chat: vi.fn(async (messages: ChatMessage[]) => {
      seen.push([...messages]);
      const message = replies.shift();
      if (!message || message.role !== "assistant") throw new Error("risposte finite");
      return { message, tokens: 10 };
    }),
  } as unknown as LlmProvider & { seen: ChatMessage[][] };
}

const guideCall: ChatMessage = {
  role: "assistant",
  content: null,
  tool_calls: [{ id: "c1", type: "function", function: { name: "guida_app", arguments: "{}" } }],
};

describe("Ask PREDICTRA: guida e seconda possibilità", () => {
  it("le domande sull'uso dell'app hanno una guida come fonte", async () => {
    const provider = fakeProvider([
      guideCall,
      { role: "assistant", content: "- **Certezze**: le giocate più probabili." },
    ]);
    const result = await askQuestion(provider, "come si usa?");
    expect(result.answer).toContain("Certezze");
    expect(result.sources[0]?.tool).toBe("guida_app");
    expect(result.sources[0]?.rows.length).toBeGreaterThan(5);
  });

  it("un numero non presente nei dati fa riscrivere la risposta una volta", async () => {
    const provider = fakeProvider([
      guideCall,
      { role: "assistant", content: "PREDICTRA ha 7 sezioni." },
      { role: "assistant", content: "PREDICTRA ha diverse sezioni." },
    ]);
    const result = await askQuestion(provider, "come si usa?");
    expect(result.answer).toBe("PREDICTRA ha diverse sezioni.");
    expect(provider.seen.at(-1)?.at(-1)?.content).toContain("7");
  });

  it("se anche la riscrittura inventa numeri, la risposta è scartata", async () => {
    const provider = fakeProvider([
      { role: "assistant", content: "Ci sono 7 pagine." },
      { role: "assistant", content: "Ci sono 8 pagine." },
    ]);
    const result = await askQuestion(provider, "come si usa?");
    expect(result.answer).toBeNull();
    expect(result.rejectedNumbers).toEqual(["8"]);
  });
});
