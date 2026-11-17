import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/certainties/load", () => ({ loadHomeCertainties: vi.fn() }));

const { currentSeasonRows } = await import("./tools");

describe("stagione in corso per Ask", () => {
  const starts: Record<number, string> = {
    10: "2026-08-22", // Serie A 2026/27
    11: "2026-09-15", // Champions 2026/27
    90: "2023-09-19", // Champions 2023/24, caricata dopo: id più alto
    91: "2024-08-17", // Serie A 2024/25, caricata dopo
  };
  const row = (season_id: number, competition_id: number) => ({
    team_id: 1,
    competition_id,
    season_id,
  });

  it("tiene la stagione più recente di ogni competizione, non l'id più alto", () => {
    const rows = [row(90, 2), row(91, 1), row(10, 1), row(11, 2)];
    const kept = currentSeasonRows(rows, (r) => starts[r.season_id] ?? null);
    expect(kept.map((r) => r.season_id).sort()).toEqual([10, 11]);
  });

  it("scarta le competizioni giocate solo in anni passati", () => {
    const rows = [row(10, 1), row(90, 2)];
    const kept = currentSeasonRows(rows, (r) => starts[r.season_id] ?? null);
    expect(kept.map((r) => r.season_id)).toEqual([10]);
  });
});
