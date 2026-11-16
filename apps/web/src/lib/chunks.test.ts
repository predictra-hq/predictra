import { describe, expect, it } from "vitest";
import { inChunks } from "./chunks";

describe("inChunks", () => {
  it("mantiene l'ordine e rispetta il limite di richieste insieme", async () => {
    let running = 0;
    let peak = 0;
    const out = await inChunks(
      [1, 2, 3, 4, 5, 6, 7],
      2,
      async (chunk) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return chunk.map((x) => x * 10);
      },
      2,
    );
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(2);
  });

  it("nessun gruppo con lista vuota", async () => {
    expect(await inChunks([], 3, async () => [1])).toEqual([]);
  });
});
