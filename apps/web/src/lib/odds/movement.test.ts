import { describe, expect, it } from "vitest";
import { movementDirection, oddsMovement, sparklinePoints, type OddsPoint } from "./movement";

const point = (bookmaker: string, selection: string, price: number, at: string): OddsPoint => ({
  bookmaker,
  selection,
  price,
  at,
});

describe("movimento delle quote", () => {
  const points = [
    point("a", "HOME", 2.0, "2026-11-01T10:00:00Z"),
    point("b", "HOME", 2.2, "2026-11-01T10:00:00Z"),
    point("a", "HOME", 1.8, "2026-11-02T10:00:00Z"),
    point("b", "HOME", 2.0, "2026-11-03T10:00:00Z"),
    point("a", "DRAW", 3.4, "2026-11-01T10:00:00Z"),
  ];

  it("apertura e ultima sono medie tra i bookmaker", () => {
    const [home] = oddsMovement(points, ["HOME"]);
    expect(home!.open).toBeCloseTo(2.1);
    expect(home!.last).toBeCloseTo(1.9);
    expect(home!.change).toBeCloseTo(1.9 / 2.1 - 1);
    expect(home!.bookmakers).toBe(2);
  });

  it("la serie usa le quote in vigore a ogni aggiornamento", () => {
    const [home] = oddsMovement(points, ["HOME"]);
    expect(home!.series.map((s) => Number(s.price.toFixed(2)))).toEqual([2.1, 2.0, 1.9]);
  });

  it("l'ordine di arrivo delle righe non conta", () => {
    expect(oddsMovement([...points].reverse(), ["HOME"])).toEqual(oddsMovement(points, ["HOME"]));
  });

  it("esiti senza quote non compaiono; un solo rilevamento non si muove", () => {
    const rows = oddsMovement(points, ["HOME", "DRAW", "AWAY"]);
    expect(rows.map((r) => r.selection)).toEqual(["HOME", "DRAW"]);
    expect(rows[1]!.change).toBe(0);
  });

  it("scarta prezzi non validi", () => {
    expect(
      oddsMovement([point("a", "HOME", Number.NaN, "2026-11-01T10:00:00Z")], ["HOME"]),
    ).toEqual([]);
  });
});

describe("direzione", () => {
  it("sotto l'1% la quota è ferma", () => {
    expect(movementDirection(-0.05)).toBe("down");
    expect(movementDirection(0.03)).toBe("up");
    expect(movementDirection(0.004)).toBe("flat");
  });
});

describe("linea del grafico", () => {
  it("serve più di un punto", () => {
    expect(sparklinePoints([{ at: "2026-11-01T10:00:00Z", price: 2 }], 100, 20)).toBeNull();
  });

  it("la quota più alta sta in cima, il tempo va da sinistra a destra", () => {
    const line = sparklinePoints(
      [
        { at: "2026-11-01T00:00:00Z", price: 2 },
        { at: "2026-11-02T00:00:00Z", price: 1.5 },
        { at: "2026-11-03T00:00:00Z", price: 1 },
      ],
      100,
      20,
    );
    expect(line).toBe("0.0,0.0 50.0,10.0 100.0,20.0");
  });
});
