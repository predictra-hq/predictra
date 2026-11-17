/*
 * Service worker di PREDICTRA (ADR 0059). Fa una cosa sola: se una pagina non si carica
 * perché manca la rete, mostra la schermata «Sei offline». Non conserva pagine, dati o
 * codice dell'app: tutto il resto passa dalla rete come se il service worker non ci fosse.
 */
const CACHE = "predictra-offline-v1";
const OFFLINE_PATH = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_PATH, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Solo l'apertura di una pagina; immagini, dati e codice non passano da qui.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_PATH).then((cached) => cached || Response.error()),
    ),
  );
});
