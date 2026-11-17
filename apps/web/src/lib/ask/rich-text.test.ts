import { describe, expect, it } from "vitest";
import { parseRichText, parseSpans } from "./rich-text";

describe("testo delle risposte di Ask", () => {
  it("riconosce il grassetto e toglie gli asterischi", () => {
    expect(parseSpans("La forma recente è **P N V P N**.")).toEqual([
      { text: "La forma recente è ", bold: false },
      { text: "P N V P N", bold: true },
      { text: ".", bold: false },
    ]);
    expect(parseSpans("un *asterisco* spaiato")).toEqual([
      { text: "un asterisco spaiato", bold: false },
    ]);
  });

  it("raggruppa gli elenchi e separa i paragrafi", () => {
    const blocks = parseRichText("Ecco:\n- **Lazio** 29 punti\n- Inter 28 punti\n\n## Nota\nFine.");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "paragraph", "paragraph"]);
    expect(blocks[1]).toEqual({
      type: "list",
      items: [
        [
          { text: "Lazio", bold: true },
          { text: " 29 punti", bold: false },
        ],
        [{ text: "Inter 28 punti", bold: false }],
      ],
    });
    expect(blocks[2]).toEqual({ type: "paragraph", spans: [{ text: "Nota", bold: true }] });
  });
});
