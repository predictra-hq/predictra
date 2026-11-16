/**
 * Letture a gruppi in parallelo: divide `items` in gruppi da `size` ed esegue `fn` su
 * al massimo `concurrency` gruppi alla volta. Serve per le letture per partita (quote,
 * previsioni): gruppi piccoli stanno in una sola pagina, e in parallelo si evitano decine
 * di richieste una dopo l'altra.
 */
export async function inChunks<T, R>(
  items: readonly T[],
  size: number,
  fn: (chunk: T[]) => Promise<R[]>,
  concurrency = 8,
): Promise<R[]> {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  const results: R[][] = new Array(chunks.length);
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const index = next++;
      results[index] = await fn(chunks[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return results.flat();
}
