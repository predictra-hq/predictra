import type { NextConfig } from "next";
import packageJson from "./package.json";

// La Content-Security-Policy con nonce la imposta il proxy a ogni richiesta (src/proxy.ts).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Piattaforma privata: mai indicizzata.
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  // Cache Components disattivato: app privata e interamente dinamica per utente
  // (ADR 0006). Si rivaluta quando esisteranno dati condivisi cacheabili (M2+).
  poweredByHeader: false,
  // Fissati alla build (src/lib/version.ts): il commit serve solo all'avviso di aggiornamento,
  // il numero di versione di package.json è quello mostrato agli utenti (docs/operations/interfaccia.md).
  env: { APP_VERSION: process.env.GITHUB_SHA ?? "local", APP_RELEASE: packageJson.version },
  transpilePackages: ["@predictra/quant", "@predictra/shared-types"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Indirizzi in inglese: i vecchi indirizzi in italiano portano ai nuovi.
  async redirects() {
    return [
      { source: "/certezze", destination: "/certainties", permanent: true },
      { source: "/affidabilita", destination: "/reliability", permanent: true },
      { source: "/discussions", destination: "/locker-room?c=matches", permanent: true },
      { source: "/community", destination: "/locker-room", permanent: true },
    ];
  },
};

export default nextConfig;
