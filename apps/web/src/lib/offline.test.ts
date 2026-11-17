import { describe, expect, it } from "vitest";
import { OFFLINE_CSP, offlinePageHtml } from "./offline";

const texts = {
  appName: "PREDICTRA",
  title: "Sei offline",
  text: "Nessuna rete.",
  retry: "Riprova",
};

describe("schermata offline", () => {
  it("contiene i testi e nessuno script", () => {
    const html = offlinePageHtml(texts);
    expect(html).toContain("<h1>Sei offline</h1>");
    expect(html).toContain('<a href="">Riprova</a>');
    expect(html).not.toMatch(/<script/i);
  });

  it("neutralizza i caratteri HTML nei testi", () => {
    expect(offlinePageHtml({ ...texts, text: "<b>&" })).toContain("&lt;b&gt;&amp;");
  });

  it("la CSP non permette script né collegamenti esterni", () => {
    expect(OFFLINE_CSP).toContain("default-src 'none'");
    expect(OFFLINE_CSP).not.toContain("script-src");
  });
});
