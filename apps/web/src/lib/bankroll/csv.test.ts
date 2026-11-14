import type { BetRow } from "@predictra/shared-types";
import { describe, expect, it } from "vitest";
import { betsToCsv, csvInstant, csvNumber, csvText, type BetCsvLabels } from "./csv";

const labels: BetCsvLabels = {
  columns: {
    placedAt: "Data (UTC)",
    bankroll: "Bankroll",
    kind: "Tipo",
    event: "Partita o evento",
    market: "Mercato",
    selection: "Selezione",
    line: "Linea",
    odds: "Quota",
    stake: "Stake",
    bookmaker: "Bookmaker",
    status: "Stato",
    payout: "Incasso",
    profit: "Profitto",
    closingOdds: "Quota di chiusura",
    modelProbability: "Probabilità del modello",
    settledAt: "Chiusa il (UTC)",
    note: "Nota",
  },
  kinds: { REAL: "Reale", SIMULATED: "Simulato" },
  statuses: {
    OPEN: "Aperta",
    WON: "Vinta",
    LOST: "Persa",
    VOID: "Rimborsata",
    HALF_WON: "Mezza vinta",
    HALF_LOST: "Mezza persa",
    CASHED_OUT: "Cash out",
  },
};

const bet: BetRow = {
  id: 1,
  bankroll_id: 1,
  bankroll_kind: "REAL",
  bankroll_name: "Principale",
  placed_at: "2026-11-14T18:45:00.123+00:00",
  match_id: null,
  description: "Inter – Milan",
  market: "1X2",
  selection: "HOME",
  line: null,
  odds: 2.1,
  stake: 10,
  bookmaker: null,
  status: "LOST",
  payout: 0,
  profit: -10,
  settled_at: "2026-11-14T21:00:00+00:00",
  closing_odds: 2.05,
  bet_proposal_id: null,
  model_version_id: null,
  model_probability: 0.5123,
  note: null,
  created_at: "2026-11-14T18:45:00+00:00",
  updated_at: "2026-11-14T21:00:00+00:00",
};

describe("celle", () => {
  it("testo: virgolette quando serve, formule neutralizzate", () => {
    expect(csvText("Inter – Milan")).toBe("Inter – Milan");
    expect(csvText('a;b "c"')).toBe('"a;b ""c"""');
    expect(csvText("=SOMMA(A1:A9)")).toBe("'=SOMMA(A1:A9)");
    expect(csvText("-1 gol")).toBe("'-1 gol");
    expect(csvText("@link")).toBe("'@link");
    expect(csvText(null)).toBe("");
  });

  it("numeri con la virgola, vuoti se assenti", () => {
    expect(csvNumber(2.1)).toBe("2,10");
    expect(csvNumber(-10)).toBe("-10,00");
    expect(csvNumber(0)).toBe("0,00");
    expect(csvNumber(0.5123, 4)).toBe("0,5123");
    expect(csvNumber(null)).toBe("");
    expect(csvNumber(Number.NaN)).toBe("");
  });

  it("istanti in ISO UTC senza millisecondi", () => {
    expect(csvInstant("2026-11-14T19:45:00.123+01:00")).toBe("2026-11-14T18:45:00Z");
    expect(csvInstant(null)).toBe("");
    expect(csvInstant("non una data")).toBe("");
  });
});

describe("betsToCsv", () => {
  it("intestazione e una riga per giocata, separatore ;", () => {
    const lines = betsToCsv([bet], labels).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("");
    expect(lines[0]?.split(";")).toHaveLength(17);
    expect(lines[0]?.startsWith("Data (UTC);Bankroll;Tipo;")).toBe(true);
    expect(lines[1]).toBe(
      "2026-11-14T18:45:00Z;Principale;Reale;Inter – Milan;1X2;HOME;;2,10;10,00;;Persa;0,00;-10,00;2,05;0,5123;2026-11-14T21:00:00Z;",
    );
  });

  it("senza giocate resta la sola intestazione", () => {
    expect(betsToCsv([], labels).split("\r\n")).toHaveLength(2);
  });
});
