import "server-only";
import { checkNumbers } from "./guard";
import type { ChatMessage, LlmProvider } from "./provider";
import { runTool, TOOL_DEFINITIONS, type ToolOutput } from "./tools";

/*
 * Ciclo domanda → strumenti → risposta di Ask PREDICTRA (ADR 0042).
 * Il prompt di sistema è parte della logica, non un testo dell'interfaccia.
 */

const MAX_ROUNDS = 5;

function systemPrompt(now: Date): string {
  return [
    "Sei l'assistente di PREDICTRA, una piattaforma privata di analisi del calcio. Rispondi in italiano, in modo breve, chiaro e semplice, come a un amico che non è un tecnico.",
    "Usa SOLO i dati restituiti dagli strumenti: chiama sempre almeno uno strumento prima di rispondere a una domanda sul calcio, anche se pensi di conoscere la risposta (i tuoi ricordi sono vecchi, i dati degli strumenti sono quelli attuali).",
    "Quale strumento usare:",
    "- una squadra, come sta andando: statistiche_squadra (stagione in corso, una riga per competizione) e, se serve la posizione rispetto alle altre, classifica;",
    "- una partita precisa: cerca_partite per trovare il match_id, poi previsioni_partita e quote_partita;",
    "- le partite di un campionato: partite_campionato;",
    "- cosa giocare, partite più sicure: giocate_piu_probabili; schedine già pronte: proposte.",
    "Quando citi una statistica di squadra di' sempre a quale competizione e stagione si riferisce, e non mescolare competizioni diverse. Se i dati hanno più righe, usa quella del campionato nazionale salvo richiesta diversa.",
    "Regole sui numeri, senza eccezioni:",
    "- cita probabilità, quote, statistiche, date e conteggi solo come appaiono nei dati degli strumenti;",
    "- non stimare, non calcolare (niente differenze, medie, quote eque, percentuali nuove), non arrotondare in modo diverso;",
    "- se un dato manca, dillo e non inventarlo.",
    'Formato: frasi brevi. Puoi usare **grassetto** per i dati più importanti e righe che iniziano con "- " per gli elenchi. Niente tabelle, titoli o altri simboli.',
    "Nella forma recente V = vittoria, N = pareggio, P = sconfitta, dalla partita più recente: spiegala a parole.",
    "Non dare consigli su quanto puntare e non incoraggiare a scommettere: PREDICTRA è informativa e non piazza scommesse.",
    "Se la domanda non riguarda il calcio o i dati di PREDICTRA, spiega gentilmente che puoi rispondere solo su partite, previsioni, quote, statistiche, classifiche, modello e proposte.",
    `Oggi è il ${now.toISOString().slice(0, 10)}.`,
  ].join("\n");
}

export interface AskResult {
  /** Risposta dell'LLM, se ha superato il controllo sui numeri. */
  answer: string | null;
  /** Numeri non presenti nei dati, se la risposta è stata scartata. */
  rejectedNumbers: string[];
  sources: ToolOutput[];
  tokens: number;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function askQuestion(
  provider: LlmProvider,
  question: string,
  now: Date = new Date(),
): Promise<AskResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(now) },
    { role: "user", content: question },
  ];
  const sources: ToolOutput[] = [];
  let tokens = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { message, tokens: used } = await provider.chat(messages, TOOL_DEFINITIONS);
    tokens += used;
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      const answer = (message.content ?? "").trim();
      if (!answer) break;
      const check = checkNumbers(answer, [question, ...sources.map((s) => JSON.stringify(s))]);
      return {
        answer: check.ok ? answer : null,
        rejectedNumbers: check.unknown,
        sources,
        tokens,
      };
    }
    messages.push({ role: "assistant", content: message.content, tool_calls: calls });
    for (const call of calls) {
      let output: ToolOutput;
      try {
        output = await runTool(call.function.name, parseArgs(call.function.arguments));
      } catch {
        output = { tool: call.function.name, title: call.function.name, source: null, rows: [] };
      }
      if (output.rows.length > 0) sources.push(output);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(output),
      });
    }
  }
  return { answer: null, rejectedNumbers: [], sources, tokens };
}
