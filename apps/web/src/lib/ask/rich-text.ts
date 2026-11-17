/**
 * Testo delle risposte di Ask PREDICTRA: l'assistente può usare **grassetto** ed elenchi
 * con "- ". Qui si trasforma in blocchi da disegnare, senza HTML: tutto il resto dei
 * simboli Markdown (titoli, asterischi spaiati, apici inversi) viene tolto.
 */

export interface RichSpan {
  text: string;
  bold: boolean;
}

export type RichBlock =
  { type: "paragraph"; spans: RichSpan[] } | { type: "list"; items: RichSpan[][] };

/** Divide una riga in tratti normali e in grassetto (`**così**` o `__così__`). */
export function parseSpans(line: string): RichSpan[] {
  const spans: RichSpan[] = [];
  const pattern = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  const clean = (text: string) => text.replace(/\*+|`+/g, "");
  for (const match of line.matchAll(pattern)) {
    const before = clean(line.slice(last, match.index));
    if (before) spans.push({ text: before, bold: false });
    const bold = clean(match[1] ?? match[2] ?? "");
    if (bold) spans.push({ text: bold, bold: true });
    last = match.index + match[0].length;
  }
  const rest = clean(line.slice(last));
  if (rest) spans.push({ text: rest, bold: false });
  return spans;
}

export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const spans = parseSpans(item[1]!);
      const last = blocks.at(-1);
      if (last?.type === "list") last.items.push(spans);
      else blocks.push({ type: "list", items: [spans] });
      continue;
    }
    // Un titolo Markdown diventa una riga in grassetto.
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    blocks.push({
      type: "paragraph",
      spans: heading
        ? parseSpans(heading[1]!).map((s) => ({ ...s, bold: true }))
        : parseSpans(line),
    });
  }
  return blocks;
}
