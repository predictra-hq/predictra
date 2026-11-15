import { describe, expect, it } from "vitest";
import { auditHref, pageRange, parseAuditFilters, totalPages } from "./filters";

describe("filtri dell'audit", () => {
  it("accetta solo azioni note, date valide e pagine positive", () => {
    expect(
      parseAuditFilters({
        action: "model.activated",
        from: "2026-11-01",
        to: "2026-11-08",
        page: "3",
      }),
    ).toEqual({
      action: "model.activated",
      from: "2026-11-01T00:00:00.000Z",
      toExclusive: "2026-11-09T00:00:00.000Z",
      page: 3,
    });
    expect(
      parseAuditFilters({ action: "drop table", from: "ieri", to: "2026-13-45", page: "-1" }),
    ).toEqual({ action: null, from: null, toExclusive: null, page: 1 });
  });

  it("paginazione", () => {
    expect(pageRange(1)).toEqual([0, 49]);
    expect(pageRange(3)).toEqual([100, 149]);
    expect(totalPages(0)).toBe(1);
    expect(totalPages(101)).toBe(3);
  });

  it("link che mantengono i filtri", () => {
    expect(auditHref({ action: "model.activated", from: "2026-11-01" }, 2)).toBe(
      "/admin/audit?action=model.activated&from=2026-11-01&page=2",
    );
    expect(auditHref({}, 1)).toBe("/admin/audit");
  });
});
