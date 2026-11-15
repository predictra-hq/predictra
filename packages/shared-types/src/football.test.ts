import { describe, expect, it } from "vitest";
import { isFinalMatchStatus, MATCH_STATUSES } from "./football";

describe("stati partita", () => {
  it("solo FINISHED e AWARDED hanno un risultato definitivo", () => {
    const finals = MATCH_STATUSES.filter(isFinalMatchStatus);
    expect(finals).toEqual(["FINISHED", "AWARDED"]);
  });
});
