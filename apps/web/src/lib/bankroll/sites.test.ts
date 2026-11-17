import { describe, expect, it } from "vitest";
import { splitSiteChoice, untrackedSites } from "./sites";

describe("siti del bankroll", () => {
  it("toglie dall'elenco fisso i siti di cui raccogliamo le quote", () => {
    const sites = untrackedSites([{ title: "Unibet (IT)" }, { title: "Codere (IT)" }]);
    expect(sites).not.toContain("Unibet");
    expect(sites).toContain("Eurobet");
  });

  it("distingue sito raccolto, sito dell'elenco e nome scritto a mano", () => {
    expect(splitSiteChoice("codere_it", "")).toEqual({
      bookmakerCode: "codere_it",
      bookmakerName: null,
    });
    expect(splitSiteChoice("site:Eurobet", "")).toEqual({
      bookmakerCode: null,
      bookmakerName: "Eurobet",
    });
    expect(splitSiteChoice("site:Inventato", "Mio sito")).toEqual({
      bookmakerCode: null,
      bookmakerName: "Mio sito",
    });
    expect(splitSiteChoice("", "Mio sito")).toEqual({
      bookmakerCode: null,
      bookmakerName: "Mio sito",
    });
  });
});
