import type { NextConfig } from "next";

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
  // Versione dell'app fissata alla build: serve all'avviso di aggiornamento (src/lib/version.ts).
  env: { APP_VERSION: process.env.GITHUB_SHA ?? "local" },
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
};

export default nextConfig;
