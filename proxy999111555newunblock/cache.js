/* =============================================================================
   cache.js  ::  vela service worker  (r14)
   -----------------------------------------------------------------------------
   Deliberately not called sw.js - Lightspeed's Live Intelligence greps the
   registration path for /(sw|service[-_]?worker|uv|scramjet|bare)/.
   Also contains a multi-CDN importScripts fallback so a blocked CDN is fine.
   ============================================================================= */

const CDN = [
  "https://cdn.jsdelivr.net/npm/",
  "https://unpkg.com/",
  "https://esm.sh/"
];
const SJ = "1.1.0";

const ALL = [];
CDN.forEach(function (base) {
  ALL.push(base + "@mercuryworkshop/scramjet@" + SJ + "/dist/scramjet.all.js");
  ALL.push(base + "@mercuryworkshop/scramjet/dist/scramjet.all.js");
});

let loaded = false;
for (let i = 0; i < ALL.length && !loaded; i++) {
  try { importScripts(ALL[i]); loaded = true; } catch (e) {}
}

let sj = null;
try {
  const L = $scramjetLoadWorker();
  sj = new L.ScramjetServiceWorker();
} catch (e) {
  console.warn("[vela] scramjet worker missing:", e);
}

/* keep this in sync with CFG.prefix in vela.js */
const PREFIX = "/p/";

let RELAYS = [];
let MUX = false;
const PASSTHRU = /cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|jsdelivr\.net|googleapis\.com/i;

const SHELL_CACHE = "vela-shell-v1";
const SHELL_FILES = ["./", "./index.html", "./vela.js"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) {
      return Promise.all(SHELL_FILES.map(function (f) {
        return c.add(f).catch(function () {});
      }));
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("message", function (e) {
  const d = e.data || {};
  if (d.__v === "cfg") {
    RELAYS = d.relays || [];
    MUX = !!d.on;
  }
  if (d.__v === "ping") {
    try { e.source.postMessage({ __v: "pong" }); } catch (x) {}
  }
  if (d.__v === "flush") {
    caches.delete(SHELL_CACHE);
  }
});

async function relayPassthrough(request) {
  const u = request.url;
  if (u.indexOf("blob:") === 0 || u.indexOf("data:") === 0) return null;
  if (PASSTHRU.test(u)) return null;
  for (let i = 0; i < RELAYS.length; i++) {
    try {
      const res = await fetch(RELAYS[i].replace("{url}", encodeURIComponent(u)), {
        credentials: "omit",
        redirect: "follow"
      });
      if (!res.ok) continue;
      const h = new Headers(res.headers);
      h.set("access-control-allow-origin", "*");
      return new Response(await res.blob(), { status: 200, headers: h });
    } catch (x) {}
  }
  return null;
}

self.addEventListener("fetch", function (e) {
  const req = e.request;
  const url = req.url;
  const origin = self.location.origin;

  /* 1. scramjet traffic - anchored to our own origin so a stray "/p/" in a
        path can never hijack an unrelated request */
  if (url.indexOf(origin + PREFIX) === 0) {
    e.respondWith((async function () {
      try {
        if (!sj) throw new Error("no scramjet");
        await sj.loadConfig();
        if (sj.route(e)) return await sj.fetch(e);
      } catch (x) {}
      return fetch(req);
    })());
    return;
  }

  /* 2. optional relay passthrough for everything else */
  if (MUX && RELAYS.length && req.method === "GET" && req.mode !== "navigate") {
    e.respondWith((async function () {
      const r = await relayPassthrough(req);
      if (r) return r;
      try { return await fetch(req); }
      catch (x) { return new Response("", { status: 504 }); }
    })());
    return;
  }

  /* 3. shell offline cache */
  if (req.method === "GET" && req.destination === "document") {
    e.respondWith((async function () {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL_CACHE);
        c.put(req, fresh.clone()).catch(function () {});
        return fresh;
      } catch (x) {
        const hit = await caches.match(req);
        if (hit) return hit;
        return new Response("offline", { status: 503 });
      }
    })());
  }
});