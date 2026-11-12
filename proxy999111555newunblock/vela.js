/* =============================================================================
   VELA 13  ::  engine
   -----------------------------------------------------------------------------
   00 cfg        01 util      02 bus       03 log      04 store    05 sound
   06 toast      07 modal     08 icons     09 fav    10 affinity 11 cache
   12 fleet      13 pool      14 netlog    15 wisp    16 wisphhtp  17 doh
   18 net        19 prober    20 scramjet  21 wtrans  22 shim     23 rewriter
   24 renderer   25 pane      26 tabs      27 history 28 marks    29 cloaker
   30 decoy      31 finder    32 reader    33 tools   34 downloads 35 rules
   36 intercept  37 stealth   38 workergen 39 palette 40 fx       41 radar
   42 diag       43 storage   44 session   45 ui      46 keys     47 bridge
   48 boot
   ========================================================================== */
(function (global) {
"use strict";

const VELA = {};
global.VELA = VELA;

/* =============================================================================
   00  cfg
   ============================================================================= */
const VERSION = "13.0.1";
const BUILD = "vela-13.0.1";

const CFG = {
  version: VERSION,
  build: BUILD,
  swFile: "cache.js",
  swFallback: "cache-worker.js",
  prefix: "p",
  frameName: "f",
  t: {
    fetch: 22000, probe: 6500, race: 8500, sub: 16000, hedge: 2200,
    wispOpen: 8000, wispIdle: 45000, swBoot: 15000, mount: 6000, ping: 5000
  },
  raceWidth: 3, hedgeWidth: 2, retries: 2, retryBase: 240,
  breaker: { threshold: 2, cooldown: 50000 },
  cacheTTL: 5 * 60 * 1000, cacheMax: 150, maxHistory: 900,
  subConcurrency: 8, maxRedirects: 6,
  /* worker subrequest budget: free plan is 50, paid is 1000 */
  wispBudget: 12,
  lsPrefix: "vela13:", idb: "vela13-db", idbVer: 1,
  sj: { sj: "1.1.0", mux: "2.1.9", tr: "1.5.2" },
  cdn: ["https://cdn.jsdelivr.net/npm/", "https://unpkg.com/", "https://esm.sh/"],
  home: "https://html.duckduckgo.com/html/",
  probe: "https://example.com/",
  probeHost: "example.com"
};

/* no translate route any more */
const ROUTES = {
  scram:   { label: "Scramjet (service worker)", tr: "scram",  rw: "none"  },
  ghost:   { label: "Ghost (about:blank)",       tr: "blank",  rw: "deep"  },
  stealth: { label: "Stealth (blob + deep)",     tr: "blob",   rw: "deep"  },
  opaque:  { label: "Opaque (data: url)",        tr: "data",   rw: "base"  },
  srcdoc:  { label: "srcdoc (light stealth)",    tr: "srcdoc", rw: "base"  },
  airgap:  { label: "Airgap (all inlined)",      tr: "srcdoc", rw: "inline"},
  inline:  { label: "Inline (self contained)",   tr: "blob",   rw: "inline"},
  src:     { label: "Frame (relay as src)",      tr: "src",    rw: "none"  },
  direct:  { label: "Direct (raw frame)",        tr: "direct", rw: "none"  }
};
const ROUTE_ORDER = ["auto","scram","ghost","stealth","srcdoc","airgap","opaque","inline","src","direct"];
const AUTO_ORDER   = ["scram","ghost","stealth","srcdoc","airgap","opaque","inline","src","direct"];
const HARD_ORDER   = ["scram","ghost","stealth","srcdoc","airgap","opaque","src","direct"];
const PARANOID_ORDER = ["airgap","srcdoc","stealth","ghost","opaque","inline"];

const TRANS = {
  auto:   { label: "Auto (best available)" },
  wisp:   { label: "Wisp tunnel only"      },
  worker: { label: "Worker relay only"     },
  relay:  { label: "Public relays only"    },
  direct: { label: "Direct / no tunnel"    }
};
const TRANS_ORDER = ["auto","wisp","worker","relay","direct"];

const ENGINES = {
  ddg:   { label: "DuckDuckGo", tpl: q => "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) },
  ddgl:  { label: "DDG Lite",   tpl: q => "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(q) },
  gfull: { label: "Google",     tpl: q => "https://www.google.com/search?q=" + encodeURIComponent(q) },
  gigu:  { label: "Google igu", tpl: q => "https://www.google.com/search?igu=1&q=" + encodeURIComponent(q) },
  brave: { label: "Brave",      tpl: q => "https://search.brave.com/search?q=" + encodeURIComponent(q) },
  mojeek:{ label: "Mojeek",     tpl: q => "https://www.mojeek.com/search?q=" + encodeURIComponent(q) },
  bing:  { label: "Bing",       tpl: q => "https://www.bing.com/search?q=" + encodeURIComponent(q) },
  wiki:  { label: "Wikipedia",  tpl: q => "https://en.m.wikipedia.org/w/index.php?search=" + encodeURIComponent(q) },
  start: { label: "Startpage",  tpl: q => "https://www.startpage.com/sp/search?query=" + encodeURIComponent(q) }
};

/* relays - the worker is preferred, these are the fallback rungs */
const RELAY_DEFS = [
  { id:"codetabs",  label:"CodeTabs",      tpl:"https://api.codetabs.com/v1/proxy?quest={url}", kind:"raw", trust:9, boring:3 },
  { id:"cfworkers", label:"cors.workers",  tpl:"https://test.cors.workers.dev/?{url}",           kind:"raw", trust:9, boring:9 },
  { id:"allorig",   label:"AllOrigins",    tpl:"https://api.allorigins.win/raw?url={url}",       kind:"raw", trust:8, boring:2 },
  { id:"corslol",   label:"cors.lol",      tpl:"https://api.cors.lol/?url={url}",                kind:"raw", trust:7, boring:1 },
  { id:"jina",      label:"Jina reader",   tpl:"https://r.jina.ai/{url}",                        kind:"raw", trust:7, boring:4 },
  { id:"corsproxy", label:"corsproxy.io",  tpl:"https://corsproxy.io/?url={url}",                kind:"raw", trust:6, boring:1 },
  { id:"corsfix",   label:"CORSFIX",       tpl:"https://proxy.corsfix.com/?url={url}",           kind:"raw", trust:6, boring:1 },
  { id:"allorigj",  label:"AllOrigins J",  tpl:"https://api.allorigins.win/get?url={url}",       kind:"json",trust:5, boring:2 },
  { id:"corssh",    label:"cors.sh",       tpl:"https://proxy.cors.sh/{url}",                    kind:"raw", trust:5, boring:1 },
  { id:"thing",     label:"ThingProxy",    tpl:"https://thingproxy.freeboard.io/fetch/{url}",    kind:"raw", trust:4, boring:1 },
  { id:"corsany",   label:"cors-anywhere", tpl:"https://cors-anywhere.herokuapp.com/{url}",      kind:"raw", trust:3, boring:1 },
  { id:"yacdn",     label:"Yacdn",         tpl:"https://yacdn.org/proxy/{url}",                  kind:"raw", trust:3, boring:1 },
  { id:"isogit",    label:"Isomorphic",    tpl:"https://cors.isomorphic-git.org/{url}",          kind:"raw", trust:3, boring:1 },
  { id:"whatever",  label:"WhateverOrigin",tpl:"https://whateverorigin.org/get?url={url}",       kind:"json",trust:3, boring:0 },
  { id:"corsprox",  label:"cors-proxy",    tpl:"https://cors-proxy.htmldriven.com/?url={url}",   kind:"json",trust:3, boring:1 }
];

/* third-party wisp relays, used only if you have no worker */
const WISP_DEFS = [
  { id:"mercury", label:"mercurywork", url:"wss://wisp.mercurywork.shop/", trust:9, tls:false }
];

const PRESETS = [
  { label:"Wikipedia", url:"https://en.m.wikipedia.org", safe:true },
  { label:"YouTube",   url:"https://m.youtube.com" },
  { label:"Reddit",    url:"https://old.reddit.com" },
  { label:"GitHub",    url:"https://github.com" },
  { label:"W3Schools", url:"https://www.w3schools.com" },
  { label:"Cool Math", url:"https://www.coolmathgames.com" },
  { label:"Krunker",   url:"https://krunker.io" },
  { label:"GeoGuessr", url:"https://www.geoguessr.com" },
  { label:"Chess",     url:"https://www.chess.com" },
  { label:"Spotify",   url:"https://open.spotify.com" },
  { label:"Twitch",    url:"https://m.twitch.tv" },
  { label:"Discord",   url:"https://discord.com/app" },
  { label:"Roblox",    url:"https://www.roblox.com" },
  { label:"Blooket",   url:"https://www.blooket.com" },
  { label:"Kahoot",    url:"https://kahoot.it" },
  { label:"Desmos",    url:"https://www.desmos.com/calculator" }
];

const DECOYS = [
  { id:"classroom", label:"Google Classroom", icon:"classroom" },
  { id:"docs",      label:"Google Docs",      icon:"docs" },
  { id:"drive",     label:"Google Drive",     icon:"drive" },
  { id:"gmail",     label:"Gmail",            icon:"gmail" },
  { id:"sheets",    label:"Google Sheets",    icon:"sheets" },
  { id:"slides",    label:"Google Slides",    icon:"slides" },
  { id:"khan",      label:"Khan Academy",     icon:"khan" },
  { id:"clever",    label:"Clever",           icon:"clever" },
  { id:"quizlet",   label:"Quizlet",          icon:"quizlet" },
  { id:"desmos",    label:"Desmos",           icon:"desmos" },
  { id:"canvas",    label:"Canvas",           icon:"canvas" },
  { id:"schoology", label:"Schoology",        icon:"schoology" },
  { id:"blank",     label:"Blank white",      icon:"blank" }
];

const DISGUISES = [
  { id:"none", title:null, icon:null },
  { id:"classroom", title:"Classes", icon:"classroom" },
  { id:"docs", title:"Untitled document", icon:"docs" },
  { id:"drive", title:"My Drive - Google Drive", icon:"drive" },
  { id:"gmail", title:"Inbox (1) - me@gmail.com", icon:"gmail" },
  { id:"sheets", title:"Untitled spreadsheet", icon:"sheets" },
  { id:"slides", title:"Untitled presentation", icon:"slides" },
  { id:"khan", title:"Khan Academy", icon:"khan" },
  { id:"clever", title:"Clever | Portal", icon:"clever" },
  { id:"quizlet", title:"Quizlet", icon:"quizlet" },
  { id:"desmos", title:"Desmos | Graphing Calculator", icon:"desmos" },
  { id:"canvas", title:"Dashboard | Canvas", icon:"canvas" },
  { id:"schoology", title:"Home | Schoology", icon:"schoology" },
  { id:"site", title:"__SITE__", icon:"__SITE__" }
];

const SKIP = /^(data:|blob:|javascript:|mailto:|tel:|about:|chrome:|chrome-extension:|#|\/\/)/i;

const DEFAULTS = {
  route:"auto", trans:"auto", engine:"ddg", disguise:"classroom", decoy:"classroom",
  wide:false, theme:"dark", fxOff:false, motion:"full",
  autoDecoy:false, subInline:false, swOn:true, probeBoot:true,
  titleSync:true, iconSync:true, popTabs:true, opaque:false, credless:false,
  zoom:1, boringBias:true, cacheBust:false, hard:false, paranoid:false,
  sound:false, viewTrans:true, stealthScrub:true, nativeify:true,
  split:"none", transportEngine:"libcurl", wispRotate:true, raceStreams:true,
  autoHeal:true, intercept:true, cosmetic:true, idleSuspend:false, autoRestore:true
};

/* =============================================================================
   01  util
   ============================================================================= */
function $(id) { return document.getElementById(id); }
function qs(s, r) { return (r || document).querySelector(s); }
function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function el(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
function on(n, ev, fn, o) {
  if (!n) return function () {};
  n.addEventListener(ev, fn, o || false);
  return function () { n.removeEventListener(ev, fn, o || false); };
}
function raf(fn) { return requestAnimationFrame(fn); }
function tick(fn) { return setTimeout(fn, 0); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function cut(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; }
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
function phost(u) {
  const h = host(u);
  if (!h) return cut(String(u || ""), 46);
  const p = h.split(".");
  return p.length <= 2 ? h : p[0] + "." + p.slice(-2).join(".");
}
function norm(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
  try {
    const o = new URL(u);
    return (o.protocol === "http:" || o.protocol === "https:") ? o.href : "";
  } catch (e) { return ""; }
}
function isUrl(s) {
  s = String(s || "").trim();
  if (!s || /\s/.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(s)) return true;
  return /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(\/.*)?$/i.test(s);
}
function dir(u) { try { const o = new URL(u); return o.origin + o.pathname.replace(/[^/]*$/, ""); } catch (e) { return u; } }
function swap(u, a, b) {
  try {
    const o = new URL(u);
    if (!o.pathname.toLowerCase().endsWith(a)) return "";
    o.pathname = o.pathname.slice(0, -a.length) + b;
    return o.href;
  } catch (e) { return ""; }
}
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}
function rid(n) {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < (n || 8); i++) s += a[(Math.random() * a.length) | 0];
  return s;
}
function ago(ts) {
  const d = Date.now() - ts;
  if (d < 45000) return "now";
  const m = Math.round(d / 60000);
  if (m < 60) return m + "m";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h";
  const dd = Math.round(h / 24);
  return dd < 30 ? dd + "d" : Math.round(dd / 30) + "mo";
}
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function nowMs() { return (global.performance && performance.now) ? performance.now() : Date.now(); }
function fuzzy(n, h) {
  n = n.toLowerCase(); h = String(h || "").toLowerCase();
  if (!n) return 1;
  const ix = h.indexOf(n);
  if (ix !== -1) return 100 - ix * 0.2;
  let hi = 0, sc = 0, st = 0;
  for (let i = 0; i < n.length; i++) {
    const c = n[i], j = h.indexOf(c, hi);
    if (j === -1) return 0;
    st = j === hi ? st + 1 : 0;
    sc += 1 + st * 0.6 - (j - hi) * 0.05;
    hi = j + 1;
  }
  return sc;
}
function deb(fn, ms) { let t = null; return function () { const a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }
function thr(fn, ms) {
  let last = 0, t = null;
  return function () {
    const a = arguments, s = this, now = Date.now();
    if (now - last >= ms) { last = now; fn.apply(s, a); }
    else { clearTimeout(t); t = setTimeout(function () { last = Date.now(); fn.apply(s, a); }, ms - (now - last)); }
  };
}
function pct(arr, p) {
  if (!arr.length) return 0;
  const s = arr.slice().sort(function (a, b) { return a - b; });
  return s[clamp(Math.floor(s.length * p), 0, s.length - 1)];
}
function nativeify(fn, name) {
  try {
    const nm = name || fn.name || "";
    fn.toString = function () { return "function " + nm + "() { [native code] }"; };
    Object.defineProperty(fn, "name", { value: nm, configurable: true });
  } catch (e) {}
  return fn;
}

/* =============================================================================
   02  bus / 03 log
   ============================================================================= */
const Bus = (function () {
  const m = Object.create(null);
  function add(e, f) { (m[e] || (m[e] = [])).push(f); return function () { rm(e, f); }; }
  function rm(e, f) { const a = m[e]; if (!a) return; const i = a.indexOf(f); if (i > -1) a.splice(i, 1); }
  function emit(e, p) {
    const a = m[e]; if (!a) return;
    const c = a.slice();
    for (let i = 0; i < c.length; i++) { try { c[i](p); } catch (x) { Log.warn("bus " + e, x); } }
  }
  return { on: add, off: rm, emit: emit };
})();

const Log = (function () {
  const ring = [];
  function push(lvl, args) {
    const rec = { lvl: lvl, args: args, ts: Date.now() };
    ring.push(rec);
    if (ring.length > 400) ring.shift();
    Bus.emit("log", rec);
  }
  return {
    log: function () { push("log", arguments); },
    warn: function () { push("warn", arguments); },
    err: function () { push("err", arguments); },
    all: function () { return ring; },
    clear: function () { ring.length = 0; }
  };
})();

/* =============================================================================
   04  store
   ============================================================================= */
const Store = (function () {
  let db = null, ready = false;
  const mem = Object.create(null);
  const STORES = ["kv", "history", "bookmarks", "stats", "downloads"];

  function open() {
    return new Promise(function (resolve) {
      if (!("indexedDB" in global)) return resolve(null);
      let req;
      try { req = indexedDB.open(CFG.idb, CFG.idbVer); } catch (e) { return resolve(null); }
      let settled = false;
      const fin = function (v) { if (!settled) { settled = true; resolve(v); } };
      req.onupgradeneeded = function (ev) {
        const d = ev.target.result;
        STORES.forEach(function (s) {
          if (!d.objectStoreNames.contains(s)) {
            if (s === "kv") d.createObjectStore(s);
            else if (s === "bookmarks") d.createObjectStore(s, { keyPath: "url" });
            else d.createObjectStore(s, { keyPath: "id" });
          }
        });
      };
      req.onsuccess = function () { db = req.result; ready = true; fin(db); };
      req.onerror = function () { fin(null); };
      req.onblocked = function () { fin(null); };
      setTimeout(function () { if (!ready) fin(null); }, 2600);
    });
  }

  function tx(store, mode, fn) {
    return new Promise(function (resolve, reject) {
      if (!ready || !db) return reject(new Error("no-db"));
      let t, s;
      try { t = db.transaction(store, mode); } catch (e) { return reject(e); }
      try { s = t.objectStore(store); } catch (e) { return reject(e); }
      let out, val, has = false;
      try { out = fn(s); } catch (e) { return reject(e); }
      if (out && typeof out === "object" && "result" in out && "onsuccess" in out) {
        out.onsuccess = function () { has = true; val = out.result; };
      } else { has = true; val = out; }
      t.oncomplete = function () { resolve(has ? val : undefined); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error); };
    });
  }

  function lsGet(k, d) { try { const r = localStorage.getItem(CFG.lsPrefix + k); return r == null ? d : JSON.parse(r); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(CFG.lsPrefix + k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(CFG.lsPrefix + k); } catch (e) {} }

  function get(k, d) {
    if (k in mem) return Promise.resolve(mem[k]);
    if (ready) {
      return tx("kv", "readonly", function (s) { return s.get(k); })
        .then(function (v) { return v === undefined ? d : v; })
        .catch(function () { return lsGet(k, d); });
    }
    return Promise.resolve(lsGet(k, d));
  }
  function getSync(k, d) { return (k in mem) ? mem[k] : lsGet(k, d); }
  function set(k, v) {
    mem[k] = v; lsSet(k, v);
    if (ready) return tx("kv", "readwrite", function (s) { s.put(v, k); }).catch(function () {});
    return Promise.resolve();
  }
  function del(k) {
    delete mem[k]; lsDel(k);
    if (ready) return tx("kv", "readwrite", function (s) { s.delete(k); }).catch(function () {});
    return Promise.resolve();
  }

  function listAdd(store, rec) {
    if (ready) return tx(store, "readwrite", function (s) { s.put(rec); }).catch(function () {});
    const a = lsGet(store, []); a.unshift(rec); lsSet(store, a.slice(0, 900));
    return Promise.resolve();
  }
  function listAll(store) {
    if (ready) {
      return tx(store, "readonly", function (s) { return s.getAll(); })
        .then(function (r) {
          return Array.isArray(r) ? r.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }) : [];
        })
        .catch(function () { return lsGet(store, []); });
    }
    return Promise.resolve(lsGet(store, []));
  }
  function listClear(store) {
    if (ready) return tx(store, "readwrite", function (s) { s.clear(); }).catch(function () {});
    lsSet(store, []);
    return Promise.resolve();
  }
  function listDel(store, key) {
    if (ready) return tx(store, "readwrite", function (s) { s.delete(key); }).catch(function () {});
    const a = lsGet(store, []).filter(function (x) { return x.url !== key && x.id !== key; });
    lsSet(store, a);
    return Promise.resolve();
  }

  return {
    init: open, ready: function () { return ready; },
    get: get, getSync: getSync, set: set, del: del,
    listAdd: listAdd, listAll: listAll, listClear: listClear, listDel: listDel
  };
})();

/* =============================================================================
   05  sound / 06 toast / 07 modal
   ============================================================================= */
const Sound = (function () {
  let ctx = null, enabled = false;
  function ac() {
    if (!ctx) { try { const C = global.AudioContext || global.webkitAudioContext; if (C) ctx = new C(); } catch (e) {} }
    return ctx;
  }
  function blip(f, d, type, vol) {
    if (!enabled) return;
    const c = ac(); if (!c) return;
    try {
      if (c.state === "suspended") c.resume();
      const o = c.createOscillator(), g = c.createGain(), n = c.currentTime;
      o.type = type || "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, n);
      g.gain.linearRampToValueAtTime(vol || .03, n + .008);
      g.gain.exponentialRampToValueAtTime(.0001, n + (d || .09));
      o.connect(g); g.connect(c.destination);
      o.start(n); o.stop(n + (d || .09) + .02);
    } catch (e) {}
  }
  return {
    tap: function () { blip(660, .045, "triangle", .016); },
    ok: function () { blip(880, .08, "sine", .024); setTimeout(function () { blip(1320, .1, "sine", .018); }, 68); },
    bad: function () { blip(220, .13, "sawtooth", .024); },
    toggle: function () { enabled = !enabled; if (enabled) blip(990, .07, "sine", .024); return enabled; },
    set: function (v) { enabled = !!v; },
    enabled: function () { return enabled; }
  };
})();

const Toast = (function () {
  let host = null;
  const IC = {
    ok: '<path d="M20 6L9 17l-5-5"/>',
    bd: '<path d="M18 6L6 18M6 6l12 12"/>',
    wn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    inf: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'
  };
  function show(kind, title, sub, ms) {
    if (!host) host = $("toasts");
    if (!host) return function () {};
    const life = ms === 0 ? 0 : (ms || 3600);
    const t = el("div", "toast " + (kind || "inf"));
    t.innerHTML =
      '<div class="ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (IC[kind] || IC.inf) + '</svg></div>' +
      '<div class="tbody"><div class="ttl">' + esc(title) + '</div>' +
      (sub ? '<div class="tsub">' + esc(sub) + '</div>' : '') + '</div>' +
      '<button class="tx2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">' +
      '<path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    if (life) {
      const p = el("i", "tprog");
      p.style.animation = "tprog " + life + "ms linear forwards";
      t.appendChild(p);
    }
    host.appendChild(t);
    let dead = false;
    function kill() {
      if (dead) return;
      dead = true;
      t.classList.add("out");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }
    on(qs(".tx2", t), "click", kill);
    if (life) setTimeout(kill, life);
    return kill;
  }
  return {
    show: show,
    ok: function (a, b, c) { Sound.ok(); return show("ok", a, b, c); },
    bad: function (a, b, c) { Sound.bad(); return show("bd", a, b, c); },
    warn: function (a, b, c) { return show("wn", a, b, c); },
    info: function (a, b, c) { return show("inf", a, b, c); }
  };
})();

const Modal = (function () {
  const stack = [];
  function open(id) {
    const m = $(id);
    if (!m) return;
    m.classList.add("open");
    if (stack.indexOf(id) === -1) stack.push(id);
  }
  function close(id) {
    const m = $(id);
    if (!m) return;
    m.classList.remove("open");
    const i = stack.indexOf(id);
    if (i > -1) stack.splice(i, 1);
  }
  function closeTop() {
    if (!stack.length) return false;
    close(stack[stack.length - 1]);
    return true;
  }
  function init() {
    qsa(".scrim").forEach(function (s) {
      on(s, "mousedown", function (e) { if (e.target === s) close(s.id); });
    });
    qsa("[data-close]").forEach(function (b) {
      on(b, "click", function () { close(b.getAttribute("data-close")); });
    });
  }
  return { open: open, close: close, closeTop: closeTop, any: function () { return stack.length > 0; }, init: init };
})();

/* =============================================================================
   08  icons / 09 favicons
   ============================================================================= */
const Icons = (function () {
  function w(p, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) +
      '" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }
  return {
    search: w('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    globe: w('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>'),
    star: w('<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.2l-5-4.9 6.9-1z"/>'),
    clock: w('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
    zap: w('<path d="M13 2 3 14h8l-1 8 10-12h-8z"/>'),
    layers: w('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
    shield: w('<path d="M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/>'),
    gear: w('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.2a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>'),
    text: w('<path d="M4 5h16M4 10h16M4 15h11M4 20h7"/>'),
    code: w('<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>'),
    grid: w('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    eye: w('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
    moon: w('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    route: w('<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M6 16.5V9a4 4 0 0 1 4-4h5"/>'),
    gauge: w('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    plus: w('<path d="M12 5v14M5 12h14"/>'),
    trash: w('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
    down: w('<path d="M12 3v14M6 12l6 6 6-6M4 21h16"/>'),
    refresh: w('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>'),
    wand: w('<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.5 3.5l-1.4 1.4M18.5 8.5l-1.4-1.4M11.5 8.5L10 10M3 21l9-9"/>'),
    db: w('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
    info: w('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
    check: w('<path d="M20 6L9 17l-5-5"/>'),
    wave: w('<path d="M2 12h3l2-7 3 14 3-11 2 6h7"/>'),
    bolt: w('<path d="M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2"/>'),
    socket: w('<path d="M9 3v5M15 3v5"/><rect x="5" y="8" width="14" height="9" rx="3"/><path d="M12 17v4"/>'),
    terminal: w('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 10l3 2-3 2M13 14h4"/>'),
    crosshair: w('<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
    split: w('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'),
    fleet: w('<rect x="2" y="3" width="9" height="7" rx="1.5"/><rect x="13" y="3" width="9" height="7" rx="1.5"/><rect x="2" y="14" width="9" height="7" rx="1.5"/><rect x="13" y="14" width="9" height="7" rx="1.5"/>'),
    filter: w('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
    ban: w('<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/>')
  };
})();

const Favicons = (function () {
  function u(svg) { return "data:image/svg+xml," + encodeURIComponent(svg); }
  function s(inner) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' + inner + '</svg>'; }
  const M = {
    classroom: u(s('<rect width="48" height="48" rx="7" fill="#0f9d58"/><rect x="8" y="8" width="32" height="32" rx="2" fill="#fff"/><rect x="10" y="10" width="28" height="28" rx="1" fill="#0f9d58"/><circle cx="24" cy="20" r="4.2" fill="#fff"/><path d="M15.5 33c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5z" fill="#fff"/>')),
    docs: u(s('<path d="M11 3h17l9 9v33H11z" fill="#2196f3"/><path d="M28 3l9 9h-9z" fill="#bbdefb"/><rect x="17" y="20" width="15" height="2.6" fill="#fff"/><rect x="17" y="26" width="15" height="2.6" fill="#fff"/><rect x="17" y="32" width="10" height="2.6" fill="#fff"/>')),
    sheets: u(s('<path d="M11 3h17l9 9v33H11z" fill="#0f9d58"/><path d="M28 3l9 9h-9z" fill="#a5d6a7"/><rect x="16" y="19" width="16" height="16" fill="#fff"/><path d="M16 24h16M16 29h16M21 19v16M27 19v16" stroke="#0f9d58" stroke-width="1.4"/>')),
    slides: u(s('<path d="M11 3h17l9 9v33H11z" fill="#f4b400"/><path d="M28 3l9 9h-9z" fill="#fdd663"/><rect x="15" y="20" width="18" height="13" rx="1.4" fill="#fff"/><rect x="15" y="35" width="8" height="2.4" fill="#fff"/>')),
    drive: u(s('<path d="M17.5 5h13L45 31H32z" fill="#ffc107"/><path d="M17.5 5L3 31l6.5 12L24 17z" fill="#1976d2"/><path d="M9.5 43h29L45 31H16z" fill="#4caf50"/>')),
    gmail: u(s('<rect x="5" y="11" width="38" height="27" rx="2.4" fill="#fff"/><path d="M5 13.5V19l19 12.5L43 19v-5.5L24 25.5z" fill="#ea4335"/><path d="M5 13.5L24 25.5 43 13.5z" fill="#c5221f"/><path d="M5 38V20l5 3.4V38z" fill="#fbbc04"/><path d="M43 38V20l-5 3.4V38z" fill="#34a853"/>')),
    khan: u(s('<path fill="#14bf96" d="M24 3c-9.6 5-16 13.4-16 21.6C8 33.8 15.2 41 24 41s16-7.2 16-16.4C40 16.4 33.6 8 24 3z"/><path fill="#fff" d="M24 12c-4.6 2.4-7.6 6.4-7.6 10.4 0 4.4 3.4 7.9 7.6 7.9s7.6-3.5 7.6-7.9C31.6 18.4 28.6 14.4 24 12z"/>')),
    clever: u(s('<rect width="48" height="48" rx="10" fill="#4274f4"/><path d="M33 17.5a9.5 9.5 0 1 0 0 13" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>')),
    quizlet: u(s('<rect width="48" height="48" rx="10" fill="#4255ff"/><path d="M15 15l18 18M33 15L15 33" stroke="#fff" stroke-width="4.4" stroke-linecap="round"/>')),
    desmos: u(s('<rect width="48" height="48" rx="8" fill="#fff"/><path d="M6 30c6-14 12-14 18 0s12 14 18 0" stroke="#c74440" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M24 6v36M6 24h36" stroke="#000" stroke-width="1.2" opacity=".55"/>')),
    canvas: u(s('<rect width="48" height="48" rx="9" fill="#e62429"/><path d="M12 32c4-10 8-10 12 0s8 10 12 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>')),
    schoology: u(s('<rect width="48" height="48" rx="9" fill="#0a2a52"/><path d="M16 30l4-12 4 12 4-12 4 12" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')),
    blank: u(s('<rect width="48" height="48" rx="6" fill="#fff"/><rect x="1" y="1" width="46" height="46" rx="6" fill="none" stroke="#dadce0" stroke-width="1.5"/>')),
    vela: u(s('<rect width="48" height="48" rx="11" fill="#4f8cff"/><path d="M24 8 9 15.5l15 7.5 15-7.5z" fill="#fff"/><path d="M9 32l15 7.5L39 32" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 24l15 7.5L39 24" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>')),
    generic: u(s('<rect width="48" height="48" rx="9" fill="#3b4a63"/><circle cx="24" cy="24" r="10" fill="none" stroke="#fff" stroke-width="3"/><path d="M24 3v10M24 35v10M3 24h10M35 24h10" stroke="#fff" stroke-width="3"/>'))
  };
  function get(id) { return M[id] || M.generic; }
  function live(url, sz) {
    const h = host(url);
    if (!h) return M.generic;
    return "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(h) + "&sz=" + (sz || 64);
  }
  return { get: get, live: live };
})();

/* =============================================================================
   10  affinity / 11 cache
   ============================================================================= */
const Affinity = (function () {
  let table = Object.create(null), dirty = false;
  function init() {
    return Store.get("affinity", {}).then(function (t) { if (t && typeof t === "object") table = t; });
  }
  function remember(url, id) {
    const h = host(url);
    if (!h) return;
    table[h] = { id: id, ts: Date.now() };
    dirty = true;
  }
  function get(url) {
    const h = host(url);
    if (!h) return null;
    const e = table[h];
    if (!e) return null;
    if (Date.now() - e.ts > 6 * 3600 * 1000) { delete table[h]; return null; }
    return e.id;
  }
  function flush() { if (!dirty) return; dirty = false; Store.set("affinity", table); }
  setInterval(flush, 9000);
  return { init: init, remember: remember, get: get, flush: flush };
})();

const Cache = (function () {
  const mem = new Map();
  let hits = 0, misses = 0;
  function get(url, mode) {
    const k = mode + "|" + url;
    const e = mem.get(k);
    if (!e) { misses++; return null; }
    if (Date.now() - e.t > CFG.cacheTTL) { mem.delete(k); misses++; return null; }
    hits++;
    return e.v;
  }
  function put(url, mode, v) {
    if (mem.size > CFG.cacheMax) mem.delete(mem.keys().next().value);
    mem.set(mode + "|" + url, { v: v, t: Date.now() });
  }
  function stats() { return { hits: hits, misses: misses, size: mem.size }; }
  function clear() { mem.clear(); hits = 0; misses = 0; }
  return { get: get, put: put, stats: stats, clear: clear };
})();

/* =============================================================================
   12  fleet  ::  pool of worker deployments
   -----------------------------------------------------------------------------
   Each worker carries a subrequest budget. On free plan a request allows 50
   subrequests; we reserve a margin. A worker over budget is parked until its
   socket generation rotates.
   ============================================================================= */
const Fleet = (function () {
  const nodes = [];
  const dead = Object.create(null);

  function parse(text) {
    const seen = Object.create(null);
    String(text || "").split(/[\n\r\s]+/).forEach(function (line) {
      let t = line.trim().replace(/\/+$/, "");
      if (!t) return;
      if (!/^https?:\/\//i.test(t)) t = "https://" + t;
      try { t = new URL(t).origin; } catch (e) { return; }
      if (seen[t]) return;
      seen[t] = 1;
      if (nodes.some(function (n) { return n.base === t; })) return;
      nodes.push({
        base: t, id: hash(t),
        h: { ok: 0, fail: 0, lat: 0, score: 70 },
        budget: 0, generation: 0, parked: 0, lastPing: 0
      });
    });
    nodes.forEach(function (n) {
      if (!seen[n.base] && !dead[n.base]) {
        const i = nodes.indexOf(n);
        if (i > -1) nodes.splice(i, 1);
      }
    });
  }

  function all() { return nodes; }
  function usable(n) {
    if (dead[n.id]) return false;
    if (n.parked && Date.now() < n.parked) return false;
    return true;
  }
  function live() { return nodes.filter(usable); }
  function ranked() {
    return live().slice().sort(function (a, b) {
      if (b.h.score !== a.h.score) return b.h.score - a.h.score;
      return a.h.lat - b.h.lat;
    });
  }
  function best() {
    const r = ranked();
    return r.length ? r[0] : null;
  }
  function get(id) {
    for (let i = 0; i < nodes.length; i++) if (nodes[i].id === id) return nodes[i];
    return null;
  }

  function noteOk(n, lat) {
    n.h.ok++;
    n.h.lat = n.h.lat ? (n.h.lat * 0.7 + lat * 0.3) : lat;
    n.h.score = clamp(n.h.score + 3, 0, 100);
    n.lastPing = Date.now();
  }
  function noteBad(n, why) {
    n.h.fail++;
    n.h.score = clamp(n.h.score - 14, 0, 100);
    if (n.h.score <= 8) {
      dead[n.id] = Date.now();
      Bus.emit("fleet:dead", { id: n.id, base: n.base, why: why });
    }
    Bus.emit("fleet:note", { id: n.id, ok: false });
  }
  function burn(n) {
    n.budget++;
    if (n.budget > CFG.wispBudget) {
      n.parked = Date.now() + 4000;
      n.budget = 0;
      n.generation++;
      Bus.emit("fleet:rotate", { id: n.id });
    }
  }
  function reset() { nodes.forEach(function (n) { n.budget = 0; n.parked = 0; dead[n.id] = 0; }); }

  function ping(n) {
    const t0 = nowMs();
    const ctl = ("AbortController" in global) ? new AbortController() : null;
    const to = setTimeout(function () { if (ctl) ctl.abort(); }, CFG.t.ping);
    return fetch(n.base + "/__ping", {
      cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      clearTimeout(to);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (t) {
      if (t.indexOf("ok") === -1) throw new Error("bad body");
      noteOk(n, Math.round(nowMs() - t0));
      Bus.emit("fleet:note", { id: n.id, ok: true });
      return true;
    }).catch(function (e) {
      clearTimeout(to);
      noteBad(n, e.message);
      return false;
    });
  }

  function pingAll() {
    return Promise.all(nodes.map(ping)).then(function (r) {
      return r.filter(Boolean).length;
    });
  }

  function urlFor(n, path) { return n.base + path; }
  function relayFor(n, target) { return n.base + "/relay?url=" + encodeURIComponent(target); }

  return {
    parse: parse, all: all, live: live, ranked: ranked, best: best, get: get,
    noteOk: noteOk, noteBad: noteBad, burn: burn, reset: reset,
    ping: ping, pingAll: pingAll, urlFor: urlFor, relayFor: relayFor
  };
})();

/* =============================================================================
   13  pool  ::  third-party relays + wisp endpoints
   ============================================================================= */
const Pool = (function () {
  const relays = [];
  let customs = [];
  const disabled = Object.create(null);

  function init() {
    RELAY_DEFS.forEach(function (d) {
      relays.push({
        id: d.id, label: d.label, tpl: d.tpl, kind: d.kind || "raw", boring: d.boring || 0, custom: false,
        h: { ok: 0, fail: 0, lat: 0, score: (d.trust || 5) * 10 },
        br: { fails: 0, open: false, until: 0 }, hist: []
      });
    });
    return Store.get("health13", {}).then(function (saved) {
      if (!saved || typeof saved !== "object") return;
      Object.keys(saved).forEach(function (id) {
        const p = find(id);
        if (!p || !saved[id]) return;
        p.h.score = typeof saved[id].score === "number" ? saved[id].score : p.h.score;
        p.h.lat = saved[id].lat || 0;
        p.h.ok = saved[id].ok || 0;
        p.h.fail = saved[id].fail || 0;
      });
    });
  }

  const persist = deb(function () {
    const o = {};
    relays.forEach(function (p) { o[p.id] = { score: p.h.score, lat: p.h.lat, ok: p.h.ok, fail: p.h.fail }; });
    Store.set("health13", o);
  }, 900);

  function find(id) {
    for (let i = 0; i < relays.length; i++) if (relays[i].id === id) return relays[i];
    for (let k = 0; k < customs.length; k++) if (customs[k].id === id) return customs[k];
    return null;
  }
  function setCustoms(text) {
    customs = [];
    String(text || "").split(/[\n\r]+/).forEach(function (line, i) {
      let t = line.trim();
      if (!t) return;
      if (t.indexOf("{url}") === -1) t = t.replace(/\/+$/, "") + "/?url={url}";
      customs.push({
        id: "__c" + i, label: "custom " + (i + 1), tpl: t, kind: "raw", boring: 6, custom: true,
        h: { ok: 0, fail: 0, lat: 0, score: 96 - i * 2 }, br: { fails: 0, open: false, until: 0 }, hist: []
      });
    });
  }
  function build(p, url) { return p.tpl.replace("{url}", encodeURIComponent(url)); }
  function usable(p) {
    if (disabled[p.id]) return false;
    if (p.br.open && Date.now() < p.br.until) return false;
    return true;
  }
  function ranked(opts) {
    opts = opts || {};
    const bias = opts.boring ? 1 : 0;
    return relays.filter(usable).slice().sort(function (a, b) {
      const sa = a.h.score + (bias ? a.boring * 6 : 0) + (a.custom ? 6 : 0);
      const sb = b.h.score + (bias ? b.boring * 6 : 0) + (b.custom ? 6 : 0);
      if (sb !== sa) return sb - sa;
      return a.h.lat - b.h.lat;
    }).concat(customs.filter(usable));
  }
  function noteOk(p, lat) {
    p.h.ok++;
    p.h.lat = p.h.lat ? (p.h.lat * 0.68 + lat * 0.32) : lat;
    p.br.fails = 0;
    p.br.open = false;
    p.h.score = clamp(p.h.score + 2.6 + clamp(52 - p.h.lat / 24, 0, 52) * 0.05, 0, 140);
    p.hist.push(lat);
    if (p.hist.length > 40) p.hist.shift();
    Bus.emit("pool:note", { id: p.id, ok: true });
    persist();
  }
  function noteBad(p, why) {
    p.h.fail++;
    p.h.score = clamp(p.h.score - 9, 0, 140);
    p.br.fails++;
    if (p.br.fails >= CFG.breaker.threshold) {
      p.br.open = true;
      p.br.until = Date.now() + CFG.breaker.cooldown;
      Bus.emit("pool:breaker", { id: p.id, label: p.label, why: why });
    }
    Bus.emit("pool:note", { id: p.id, ok: false });
    persist();
  }
  function health(p) {
    if (p.br.open && Date.now() < p.br.until) return "bd";
    if (p.h.score >= 62) return "ok";
    if (p.h.score >= 34) return "wn";
    return "bd";
  }
  function score(p) { return Math.round(clamp(p.h.score, 0, 100)); }

  return {
    init: init, ranked: ranked, find: find, build: build, setCustoms: setCustoms,
    noteOk: noteOk, noteBad: noteBad, health: health, score: score, persist: persist,
    relays: function () { return relays.concat(customs); }
  };
})();

/* =============================================================================
   14  netlog
   ============================================================================= */
const NetLog = (function () {
  const rows = [];
  let body = null;
  function push(r) {
    rows.unshift(r);
    if (rows.length > 300) rows.pop();
    if (body && !document.hidden) render();
  }
  function render() {
    if (!body) body = $("netLog");
    if (!body) return;
    body.innerHTML = rows.slice(0, 180).map(function (r) {
      const cls = r.ok ? "ok" : (r.tag === "CUT" ? "wn" : "bd");
      return '<div class="nlrow"><span class="nst ' + cls + '">' + esc(r.tag || (r.ok ? "200" : "ERR")) + '</span>' +
        '<span class="npr">' + esc(r.proxy || "-") + '</span><span class="nms">' + (r.ms || 0) + 'ms</span>' +
        '<span class="nur">' + esc(r.url) + '</span></div>';
    }).join("");
  }
  function clear() { rows.length = 0; render(); }
  function init() { body = $("netLog"); }
  return { push: push, render: render, clear: clear, init: init };
})();

/* =============================================================================
   15  wisp client  ::  multiplexed tunnel with generation rotation and racing
   ============================================================================= */
const Wisp = (function () {
  const PKT = { CONNECT: 1, DATA: 2, CONTINUE: 3, CLOSE: 4, INFO: 5 };
  const CLOSE = { UNKNOWN: 1, VOLUNTARY: 2, NETWORK: 3, BAD: 5, UNAVAILABLE: 6 };
  const CLOSE_TEXT = {
    1: "unknown", 2: "closed", 3: "network error", 4: "incomplete", 5: "invalid", 6: "unavailable",
    0x41: "bad address", 0x42: "host unreachable", 0x43: "connect timeout", 0x44: "refused",
    0x47: "transfer timeout", 0x48: "blocked by tunnel", 0x49: "throttled", 0x81: "client error"
  };

  const clients = new Map();

  function Client(url) {
    this.url = url;
    this.ws = null;
    this.open = false;
    this.opening = null;
    this.streams = new Map();
    this.bufSize = 32;
    this.nextId = 1;
    this.lastUse = Date.now();
    this.count = 0;
    this.generation = 0;
    this.bytes = 0;
  }

  Client.prototype.connect = function () {
    const self = this;
    if (self.open) return Promise.resolve(self);
    if (self.opening) return self.opening;
    self.opening = new Promise(function (resolve, reject) {
      let ws;
      try { ws = new WebSocket(self.url); } catch (e) { return reject(e); }
      ws.binaryType = "arraybuffer";
      let settled = false;
      const to = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch (e) {}
        reject(new Error("wisp open timeout"));
      }, CFG.t.wispOpen);

      ws.onopen = function () {
        if (settled) return;
        settled = true;
        clearTimeout(to);
        self.ws = ws;
        self.open = true;
        self.opening = null;
        resolve(self);
      };
      ws.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(to);
        self.opening = null;
        reject(new Error("wisp socket error"));
      };
      ws.onclose = function () {
        self.open = false;
        self.ws = null;
        self.opening = null;
        self.streams.forEach(function (st) { st._die("tunnel closed"); });
        self.streams.clear();
        Bus.emit("wisp:down", { url: self.url });
      };
      ws.onmessage = function (ev) { self._recv(ev.data); };
    });
    return self.opening;
  };

  /* rotate before the worker subrequest ceiling */
  Client.prototype.maybeRotate = function () {
    if (!UI.S.wispRotate) return;
    if (this.count < CFG.wispBudget) return;
    this.count = 0;
    this.generation++;
    const old = this.ws;
    this.ws = null;
    this.open = false;
    Bus.emit("wisp:rotate", { url: this.url, generation: this.generation });
    if (old) {
      const guard = setTimeout(function () { try { old.close(); } catch (e) {} }, 12000);
      old.onclose = function () { clearTimeout(guard); old.close(); };
      const self = this;
      setTimeout(function () {
        if (self.streams.size === 0) { try { old.close(); } catch (e) {} clearTimeout(guard); }
      }, 1500);
    }
  };

  Client.prototype._recv = function (data) {
    const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
    if (buf.length < 5) return;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const type = buf[0];
    const sid = dv.getUint32(1, true);
    const payload = buf.subarray(5);

    if (type === PKT.CONTINUE) {
      if (sid === 0) {
        this.bufSize = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, true);
        return;
      }
      const st = this.streams.get(sid);
      if (st) st._continue();
      return;
    }
    const st = this.streams.get(sid);
    if (!st) return;
    if (type === PKT.DATA) st._data(payload);
    else if (type === PKT.CLOSE) {
      const reason = payload.length ? payload[0] : 1;
      st._die(CLOSE_TEXT[reason] || ("close " + reason));
    }
  };

  Client.prototype._send = function (type, sid, payload) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const head = new Uint8Array(5);
    head[0] = type;
    new DataView(head.buffer).setUint32(1, sid, true);
    let out;
    if (payload && payload.length) {
      out = new Uint8Array(head.length + payload.length);
      out.set(head, 0);
      out.set(payload, 5);
    } else out = head;
    try { this.ws.send(out.buffer); this.bytes += out.length; return true; }
    catch (e) { return false; }
  };

  function Stream(client, id, host, port) {
  this.client = client;
  this.id = id;
  this.host = host;
  this.port = port;
  this.closed = false;
  this._onData = null;
  this.pre = [];
  this.onClose = null;
  this.credit = 0;
  this.queue = [];
})();

/* =============================================================================
   16  wisphhtp  ::  HTTP/1.1 inside a wisp stream
   ============================================================================= */
const WispHTTP = (function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder("utf-8", { fatal: false });

  function endpoint() {
    const n = Fleet.best();
    if (n) return Fleet.urlFor(n, "/wisp-tls/").replace(/^http/, "ws");
    return "";
  }

  function parseHead(bytes) {
    let end = -1;
    for (let i = 3; i < bytes.length; i++) {
      if (bytes[i - 3] === 13 && bytes[i - 2] === 10 && bytes[i - 1] === 13 && bytes[i] === 10) { end = i + 1; break; }
    }
    if (end === -1) return null;
    const lines = dec.decode(bytes.subarray(0, end)).split("\r\n");
    const statusLine = lines.shift() || "";
    const m = statusLine.match(/^HTTP\/1\.[01]\s+(\d{3})\s*(.*)$/);
    if (!m) return null;
    const headers = {};
    lines.forEach(function (l) {
      const i = l.indexOf(":");
      if (i === -1) return;
      const k = l.slice(0, i).trim().toLowerCase();
      const v = l.slice(i + 1).trim();
      headers[k] = headers[k] ? headers[k] + ", " + v : v;
    });
    return { end: end, status: parseInt(m[1], 10), headers: headers };
  }

  function chunked(bytes) {
    const out = [];
    let i = 0;
    while (i < bytes.length) {
      let j = i;
      while (j < bytes.length && !(bytes[j] === 13 && bytes[j + 1] === 10)) j++;
      if (j >= bytes.length) break;
      const size = parseInt(dec.decode(bytes.subarray(i, j)).split(";")[0].trim(), 16);
      if (isNaN(size)) break;
      i = j + 2;
      if (size === 0) break;
      out.push(bytes.subarray(i, i + size));
      i += size + 2;
    }
    let total = 0;
    out.forEach(function (c) { total += c.length; });
    const merged = new Uint8Array(total);
    let off = 0;
    out.forEach(function (c) { merged.set(c, off); off += c.length; });
    return merged;
  }

  function inflate(bytes, encoding) {
    if (!encoding || encoding === "identity") return Promise.resolve(bytes);
    const fmt = encoding === "br" ? "br" : (encoding === "gzip" ? "gzip" : "deflate");
    if (typeof DecompressionStream === "undefined") return Promise.resolve(bytes);
    try {
      const ds = new DecompressionStream(fmt);
      return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer()
        .then(function (b) { return new Uint8Array(b); })
        .catch(function () { return bytes; });
    } catch (e) { return Promise.resolve(bytes); }
  }

  function once(url, opts) {
    opts = opts || {};
    const ep = endpoint();
    if (!ep) return Promise.reject(new Error("no worker"));

    let u;
    try { u = new URL(url); } catch (e) { return Promise.reject(e); }
    const port = u.port ? parseInt(u.port, 10) : (u.protocol === "https:" ? 443 : 80);

    const t0 = nowMs();
    const chunks = [];
    let total = 0, done = false, st = null;
    const node = Fleet.best();

    return new Promise(function (resolve, reject) {
      const to = setTimeout(function () {
        if (done) return;
        done = true;
        if (st) st.close();
        reject(new Error("wisp http timeout"));
      }, opts.timeout || CFG.t.fetch);

      function finish(err, val) {
        if (done) return;
        done = true;
        clearTimeout(to);
        const ms = Math.round(nowMs() - t0);
        if (node) Fleet.burn(node);
        if (err) {
          if (node) Fleet.noteBad(node, err.message);
          NetLog.push({ ok: false, tag: "WERR", proxy: "wisp", ms: ms, url: cut(url, 90) });
          reject(err);
        } else {
          if (node) Fleet.noteOk(node, ms);
          NetLog.push({ ok: true, proxy: "wisp", ms: ms, url: cut(url, 90) });
          resolve(val);
        }
      }

      Wisp.openStream(ep, u.hostname, port, 1).then(function (stream) {
        st = stream;
        st.onClose = function (why) {
          if (!chunks.length) return finish(new Error("wisp: " + why));
          finish(null, assemble());
        };
        st.onData = function (payload) {
          chunks.push(payload);
          total += payload.length;
          if (total > (opts.maxBytes || 14 * 1024 * 1024)) st.close();
        };
        const head = [
          (opts.method || "GET") + " " + (u.pathname + u.search || "/") + " HTTP/1.1",
          "Host: " + u.hostname,
          "User-Agent: Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept: " + (opts.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"),
          "Accept-Language: en-US,en;q=0.9",
          "Accept-Encoding: gzip, deflate",
          "Connection: close"
        ];
        if (opts.headers) Object.keys(opts.headers).forEach(function (k) { head.push(k + ": " + opts.headers[k]); });
        if (opts.body) head.push("Content-Length: " + enc.encode(opts.body).length);
        head.push("", "");
        st.write(enc.encode(head.join("\r\n")));
        if (opts.body) st.write(enc.encode(opts.body));
      }, function (e) { finish(e); });

      function assemble() {
        let all = new Uint8Array(total), off = 0;
        chunks.forEach(function (c) { all.set(c, off); off += c.length; });
        const h = parseHead(all);
        if (!h) return { status: 0, headers: {}, raw: all, error: "bad response" };
        return { status: h.status, headers: h.headers, raw: all.subarray(h.end) };
      }
    }).then(function (res) {
      if (res.error) throw new Error(res.error);
      let body = res.raw;
      if ((res.headers["transfer-encoding"] || "").indexOf("chunked") !== -1) body = chunked(body);
      return inflate(body, (res.headers["content-encoding"] || "").split(",")[0].trim()).then(function (out) {
        return { status: res.status, headers: res.headers, bytes: out, text: dec.decode(out), url: url };
      });
    });
  }

  function request(url, opts) {
    opts = opts || {};
    const max = opts.redirects == null ? CFG.maxRedirects : opts.redirects;
    return once(url, opts).then(function (res) {
      if (res.status >= 300 && res.status < 400 && res.headers.location && max > 0) {
        let next;
        try { next = new URL(res.headers.location, url).href; } catch (e) { return res; }
        return request(next, Object.assign({}, opts, { redirects: max - 1 }));
      }
      return res;
    });
  }

  return { request: request, once: once, available: function () { return !!endpoint(); }, endpoint: endpoint };
})();

/* =============================================================================
   17  doh
   ============================================================================= */
const DoH = (function () {
  const cache = new Map();
  function query(name, type) {
    const key = type + ":" + name;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 300000) return Promise.resolve(hit.v);
    const eps = [];
    const n = Fleet.best();
    if (n) eps.push(Fleet.urlFor(n, "/doh?name=" + encodeURIComponent(name) + "&type=" + (type || "A")));
    eps.push("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(name) + "&type=" + (type || "A"));
    eps.push("https://dns.google/resolve?name=" + encodeURIComponent(name) + "&type=" + (type || "A"));
    let i = 0;
    function step() {
      if (i >= eps.length) return Promise.resolve([]);
      const url = eps[i++];
      return Fetcher.raw(url, { headers: { accept: "application/dns-json" }, timeout: 6000 })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          const a = (j && j.Answer) || [];
          const out = a.filter(function (x) { return x.type === 1 || x.type === 28; }).map(function (x) { return x.data; });
          if (!out.length) return step();
          cache.set(key, { v: out, t: Date.now() });
          return out;
        })
        .catch(step);
    }
    return step();
  }
  return { query: query };
})();

/* =============================================================================
   18  net
   ============================================================================= */
const Fetcher = (function () {
  const inflight = new Map();

  function raw(url, opts) {
    opts = opts || {};
    const ctl = ("AbortController" in global) ? new AbortController() : null;
    const to = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || CFG.t.fetch) : null;
    const init = {
      method: opts.method || "GET", cache: "no-store", redirect: "follow",
      credentials: "omit", referrerPolicy: "no-referrer", headers: opts.headers || {}
    };
    if (ctl) init.signal = ctl.signal;
    if (opts.body) init.body = opts.body;
    return fetch(url, init).then(
      function (r) { if (to) clearTimeout(to); return r; },
      function (e) { if (to) clearTimeout(to); throw e; }
    );
  }

  function viaWisp(target, opts) {
    const t0 = nowMs();
    return WispHTTP.request(target, {
      timeout: (opts && opts.timeout) || CFG.t.fetch,
      method: (opts && opts.method) || "GET",
      headers: (opts && opts.headers) || null,
      body: (opts && opts.body) || null
    }).then(function (res) {
      if (res.status >= 400) throw new Error("HTTP " + res.status);
      return { text: res.text, proxy: { id: "wisp", label: "wisp" }, ms: Math.round(nowMs() - t0), transport: "wisp" };
    });
  }

  function viaWorker(target, opts) {
    const n = Fleet.best();
    if (!n) return Promise.reject(new Error("no worker"));
    const t0 = nowMs();
    return raw(Fleet.relayFor(n, target), { timeout: (opts && opts.timeout) || CFG.t.fetch }).then(function (res) {
      Fleet.burn(n);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text().then(function (body) {
        if (!body || body.length < 20) throw new Error("empty body");
        Fleet.noteOk(n, Math.round(nowMs() - t0));
        NetLog.push({ ok: true, proxy: "worker", ms: Math.round(nowMs() - t0), url: cut(target, 90) });
        return { text: body, proxy: { id: "worker", label: "worker" }, ms: Math.round(nowMs() - t0), transport: "worker" };
      });
    }).catch(function (e) {
      Fleet.noteBad(n, e.message);
      NetLog.push({ ok: false, proxy: "worker", ms: Math.round(nowMs() - t0), url: cut(target, 90) });
      throw e;
    });
  }

  function viaRelay(p, target, opts) {
    const t0 = nowMs();
    return raw(Pool.build(p, target), { timeout: (opts && opts.timeout) || CFG.t.fetch }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text().then(function (body) {
        const ms = Math.round(nowMs() - t0);
        if (!body || body.length < 20) throw new Error("empty body");
        if (p.kind === "json") {
          try {
            const j = JSON.parse(body);
            if (j && typeof j.contents === "string") body = j.contents;
            else if (j && typeof j.body === "string") body = j.body;
          } catch (e) {}
        }
        NetLog.push({ ok: true, proxy: p.label, ms: ms, url: cut(target, 90) });
        return { text: body, proxy: p, ms: ms, transport: "relay" };
      });
    }).catch(function (e) {
      NetLog.push({ ok: false, proxy: p.label, ms: Math.round(nowMs() - t0), url: cut(target, 90) });
      throw e;
    });
  }

  function candidates(target, opts) {
    opts = opts || {};
    const t = UI.S.trans;
    const out = [];
    if (t === "auto" || t === "wisp") {
      if (WispHTTP.available()) out.push({ kind: "wisp" });
      if (Fleet.live().length) out.push({ kind: "wisp2" });
    }
    if (t === "auto" || t === "worker") {
      if (Fleet.live().length) out.push({ kind: "worker" });
    }
    if (t !== "direct") {
      let list = Pool.ranked({ boring: opts.boring });
      const stickyId = Affinity.get(target);
      if (stickyId) {
        const st = Pool.find(stickyId);
        if (st && list.indexOf(st) !== -1) list = [st].concat(list.filter(function (p) { return p !== st; }));
      }
      list.slice(0, opts.width || CFG.raceWidth).forEach(function (p) { out.push({ kind: "relay", p: p }); });
    }
    return out;
  }

  function runCandidate(c, target, opts) {
    if (c.kind === "wisp" || c.kind === "wisp2") return viaWisp(target, opts);
    if (c.kind === "worker") return viaWorker(target, opts);
    return viaRelay(c.p, target, opts);
  }

  function race(target, opts) {
    opts = opts || {};
    const cands = candidates(target, opts);
    if (!cands.length) return Promise.reject(new Error("no tunnels"));

    return new Promise(function (resolve, reject) {
      let settled = false, failed = 0;
      const errs = [];
      function finish(r) {
        if (settled) return;
        settled = true;
        if (r.proxy && r.proxy.id && r.proxy.id !== "wisp" && r.proxy.id !== "worker") {
          Affinity.remember(target, r.proxy.id);
        }
        resolve(r);
      }
      function fail(c, e) {
        if (c.p) Pool.noteBad(c.p, e.message);
        errs.push(c.kind + ": " + e.message);
        failed++;
        if (failed >= cands.length && !settled) reject(new Error(errs.join(" | ")));
      }
      cands.forEach(function (c) { runCandidate(c, target, opts).then(finish, function (e) { fail(c, e); }); });

      setTimeout(function () {
        if (settled) return;
        const seen = cands.map(function (c) { return c.p ? c.p.id : c.kind; });
        Pool.ranked().filter(function (p) { return seen.indexOf(p.id) === -1; })
          .slice(0, CFG.hedgeWidth).forEach(function (p) {
            const c = { kind: "relay", p: p };
            cands.push(c);
            runCandidate(c, target, opts).then(finish, function (e) { fail(c, e); });
          });
      }, CFG.t.hedge);
    });
  }

  function cascade(target, opts) {
    opts = opts || {};
    const cands = candidates(target, opts);
    if (!cands.length) return Promise.reject(new Error("no tunnels"));
    let rounds = opts.attempts || CFG.retries + 1, i = 0;
    const errs = [];
    function step() {
      if (i >= cands.length) {
        if (--rounds > 0) { i = 0; return sleep(CFG.retryBase * Math.random() + 90).then(step); }
        return Promise.reject(new Error(errs.join(" | ") || "all tunnels failed"));
      }
      const c = cands[i++];
      return runCandidate(c, target, opts).then(function (r) {
        if (r.proxy && r.proxy.id) Affinity.remember(target, r.proxy.id);
        return r;
      }).catch(function (e) {
        if (c.p) Pool.noteBad(c.p, e.message);
        errs.push((c.p ? c.p.label : c.kind) + ": " + e.message);
        return step();
      });
    }
    return step();
  }

  function best(target, opts) {
    opts = opts || {};
    const mode = opts.mode || "doc";
    if (!opts.noCache) {
      const cached = Cache.get(target, mode);
      if (cached) return Promise.resolve({ text: cached, proxy: { label: "cache" }, ms: 0, cached: true });
    }
    const k = mode + "|" + target;
    if (inflight.has(k)) return inflight.get(k);

    const pr = race(target, opts).catch(function () { return cascade(target, opts); }).then(function (r) {
      inflight.delete(k);
      if (!r.cached) Cache.put(target, mode, r.text);
      Bus.emit("net:done", r);
      return r;
    }, function (e) {
      inflight.delete(k);
      Bus.emit("net:error", e);
      throw e;
    });
    inflight.set(k, pr);
    return pr;
  }

  function pool(items, worker, limit) {
    limit = limit || CFG.subConcurrency;
    let i = 0, run = 0;
    const out = new Array(items.length);
    return new Promise(function (res) {
      function pump() {
        if (i >= items.length && run === 0) return res(out);
        while (run < limit && i < items.length) {
          const idx = i++;
          run++;
          Promise.resolve(worker(items[idx], idx))
            .then(function (v) { out[idx] = v; }, function (e) { out[idx] = { error: e }; })
            .then(function () { run--; pump(); });
        }
      }
      pump();
    });
  }

  function pick(urls, timeout) {
    let i = 0;
    function step() {
      if (i >= urls.length) return Promise.resolve(urls[0]);
      const u = urls[i++];
      return raw(u, { timeout: timeout || 5000 })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return u; })
        .catch(step);
    }
    return step();
  }

  return { raw: raw, best: best, race: race, cascade: cascade, pool: pool, pick: pick, viaWisp: viaWisp, viaWorker: viaWorker };
})();

/* =============================================================================
   19  prober
   ============================================================================= */
const Prober = (function () {
  let running = false;
  function relay(p) {
    const t0 = nowMs();
    return Fetcher.raw(Pool.build(p, CFG.probe), { timeout: CFG.t.probe }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (t) {
      const ms = Math.round(nowMs() - t0);
      if (!t || t.length < 20) throw new Error("empty");
      Pool.noteOk(p, ms);
      Bus.emit("probe:item", { id: p.id, ok: true, ms: ms });
      return { id: p.id, ok: true, ms: ms };
    }).catch(function (e) {
      Pool.noteBad(p, e.message);
      Bus.emit("probe:item", { id: p.id, ok: false });
      return { id: p.id, ok: false, err: e.message };
    });
  }
  function all(cb) {
    if (running) return Promise.resolve([]);
    running = true;
    const out = [];
    const rs = Pool.relays();
    let i = 0;
    const queue = rs.map(function (p) { return function () { return relay(p); }; });
    return new Promise(function (res) {
      function next() {
        if (i >= queue.length) {
          running = false;
          Pool.persist();
          Bus.emit("probe:done", out);
          if (cb) cb(out);
          return res(out);
        }
        queue[i++]().then(function (r) { out.push(r); next(); });
      }
      next();
    });
  }
  return { all: all, relay: relay };
})();

/* =============================================================================
   20  scramjet
   ============================================================================= */
const SJ = (function () {
  let booting = null, ctrl = null, conn = null, frame = null, live = false, swReg = null, assets = null;
  const SCOPE = new URL("./", location.href).pathname || "/";
  const PREFIX = new URL(CFG.prefix + "/", location.href).pathname || "/p/";

  function resolveAssets() {
    if (assets) return Promise.resolve(assets);
    const pkg = function (name, ver, file) {
      const out = [];
      ["npm/" + name + "@" + ver + "/dist/" + file, "npm/" + name + "/dist/" + file].forEach(function (rel) {
        CFG.cdn.forEach(function (base) { out.push(base + rel); });
      });
      return out;
    };
    assets = {
      all: pkg("@mercuryworkshop/scramjet", CFG.sj.sj, "scramjet.all.js"),
      wasm: pkg("@mercuryworkshop/scramjet", CFG.sj.sj, "scramjet.wasm.wasm"),
      sync: pkg("@mercuryworkshop/scramjet", CFG.sj.sj, "scramjet.sync.js"),
      mux: pkg("@mercuryworkshop/bare-mux", CFG.sj.mux, "index.js"),
      muxW: pkg("@mercuryworkshop/bare-mux", CFG.sj.mux, "worker.js"),
      tr: pkg("@mercuryworkshop/libcurl-transport", CFG.sj.tr, "index.mjs")
    };
    return Promise.resolve(assets);
  }

  function script(src) {
    return new Promise(function (res, rej) {
      if (qsa('script[data-sj]').some(function (s) { return s.getAttribute("data-sj") === src; })) return res();
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.setAttribute("data-sj", src);
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error("could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  function swSource() {
    const all = assets ? assets.all : [CFG.cdn[0] + "npm/@mercuryworkshop/scramjet@" + CFG.sj.sj + "/dist/scramjet.all.js"];
    return [
      "/* vela service worker - innocuous filename on purpose */",
      "const C = " + JSON.stringify(all) + ";",
      "let ok = false;",
      "for (let i = 0; i < C.length && !ok; i++) { try { importScripts(C[i]); ok = true; } catch (e) {} }",
      "let sj = null;",
      "try { const L = $scramjetLoadWorker(); sj = new L.ScramjetServiceWorker(); } catch (e) {}",
      "let R = [], M = false;",
      "const PASS = /cdn\\.jsdelivr\\.net|unpkg\\.com|esm\\.sh|jsdelivr\\.net|googleapis\\.com/i;",
      "const P = " + JSON.stringify(PREFIX) + ";",
      "self.addEventListener('install', function () { self.skipWaiting(); });",
      "self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });",
      "self.addEventListener('message', function (e) {",
      "  const d = e.data || {};",
      "  if (d.__v === 'cfg') { R = d.relays || []; M = !!d.on; }",
      "  if (d.__v === 'ping') { try { e.source.postMessage({ __v: 'pong' }); } catch (x) {} }",
      "});",
      "self.addEventListener('fetch', function (e) {",
      "  const u = e.request.url;",
      "  if (u.indexOf(location.origin + P) === 0) {",
      "    e.respondWith((async function () {",
      "      try { if (!sj) throw 0; await sj.loadConfig(); if (sj.route(e)) return await sj.fetch(e); } catch (x) {}",
      "      return fetch(e.request);",
      "    })());",
      "    return;",
      "  }",
      "  e.respondWith((async function () {",
      "    const r = e.request;",
      "    if (M && R.length && r.method === 'GET') {",
      "      if (u.indexOf('blob:') !== 0 && u.indexOf('data:') !== 0 && !PASS.test(u)) {",
      "        for (let i = 0; i < R.length; i++) {",
      "          try {",
      "            const res = await fetch(R[i].replace('{url}', encodeURIComponent(u)), { credentials: 'omit', redirect: 'follow' });",
      "            if (!res.ok) continue;",
      "            const h = new Headers(res.headers); h.set('access-control-allow-origin', '*');",
      "            return new Response(await res.blob(), { status: 200, headers: h });",
      "          } catch (x) {}",
      "        }",
      "      }",
      "    }",
      "    try { return await fetch(r); } catch (x) { return new Response('', { status: 504 }); }",
      "  })());",
      "});"
    ].join("\n");
  }

  function registerSW() {
    if (swReg) return swReg;
    const opts = { scope: SCOPE };
    swReg = navigator.serviceWorker.register(CFG.swFile, opts).catch(function () {
      const blob = new Blob([swSource()], { type: "text/javascript" });
      return navigator.serviceWorker.register(URL.createObjectURL(blob), opts)
        .catch(function () { return navigator.serviceWorker.register(CFG.swFallback, opts); });
    }).then(function (r) { swReg = r; return r; });
    return swReg;
  }

  function pushCfg() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    try {
      const n = Fleet.best();
      const list = n ? [Fleet.relayFor(n, "{url}")] : [];
      Pool.ranked().slice(0, 3).forEach(function (p) { list.push(Pool.build(p, "{url}")); });
      navigator.serviceWorker.controller.postMessage({ __v: "cfg", on: !!UI.S.swOn, relays: list });
    } catch (e) {}
  }

  function transportFor(conn2) {
    const mode = UI.S.transportEngine;
    if (mode === "native") {
      try {
        conn2.setTransport(WTrans, [{ websocket: WispHTTP.endpoint() }]);
        return Promise.resolve("native");
      } catch (e) {}
    }
    return Fetcher.pick(assets.tr).then(function (url) {
      return conn2.setTransport(url, [{ websocket: WispHTTP.endpoint() }]).then(function () { return "libcurl"; });
    });
  }

  function boot() {
    if (live) return Promise.resolve(true);
    if (booting) return booting;
    booting = (function () {
      if (!("serviceWorker" in navigator)) throw new Error("no service worker - needs http(s)");
      if (!global.isSecureContext && location.hostname !== "localhost") throw new Error("insecure context");
      Bus.emit("sj:stage", { stage: "libs" });
      return resolveAssets()
        .then(function () { return Fetcher.pick(assets.all); })
        .then(function (u) { assets.allChosen = u; return script(u); })
        .then(function () { return Fetcher.pick(assets.mux); })
        .then(function (u) { assets.muxChosen = u; return script(u); })
        .then(function () { Bus.emit("sj:stage", { stage: "sw" }); return registerSW(); })
        .then(function () { return navigator.serviceWorker.ready; })
        .then(function () {
          Bus.emit("sj:stage", { stage: "controller" });
          const L = global.$scramjetLoadController();
          ctrl = new L.ScramjetController({
            prefix: PREFIX,
            files: { wasm: assets.wasm[0], all: assets.allChosen, sync: assets.sync[0] },
            flags: { strictRewrites: true, captureErrors: true, allowInvalidJs: true, sourcemaps: true }
          });
          return ctrl.init();
        })
        .then(function () {
          Bus.emit("sj:stage", { stage: "transport" });
          conn = new global.BareMux.BareMuxConnection(assets.muxW[0]);
          return transportFor(conn);
        })
        .then(function (kind) {
          assets.engine = kind;
          try { ctrl.addEventListener("download", function (e) { Downloads.capture(e.download || {}); }); } catch (e) {}
          pushCfg();
          live = true;
          Bus.emit("sj:ready", kind);
          if (UI.S.stealthScrub) Stealth.scrubGlobals();
          return true;
        });
    })();
    booting = booting.catch(function (e) { booting = null; throw e; });
    return booting;
  }

  function mount(host, url) {
    host.innerHTML = "";
    host.classList.add("sjhost");
    if (frame) { try { frame.frame.remove(); } catch (e) {} frame = null; }
    frame = ctrl.createFrame();
    const fe = frame.frame;
    fe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#fff";
    fe.setAttribute("allow", "clipboard-write;fullscreen;autoplay;encrypted-media;picture-in-picture;camera;microphone");
    if (UI.S.stealthScrub) fe.setAttribute("name", CFG.frameName + rid(3));
    host.appendChild(fe);
    return new Promise(function (res) {
      let done = false;
      const fin = function () { if (!done) { done = true; res(); } };
      frame.addEventListener("urlchange", function (e) {
        if (e && e.url) Bus.emit("sj:url", e.url);
        setTimeout(fin, 240);
      });
      setTimeout(fin, CFG.t.mount + 3000);
    }).then(function () { return fe; });
  }

  function setSwOn(v) { UI.S.swOn = !!v; Store.set("swOn", !!v); pushCfg(); }
  function unregister() {
    return navigator.serviceWorker.getRegistrations().then(function (rs) {
      return Promise.all(rs.map(function (r) { return r.unregister(); }));
    }).then(function () { live = false; booting = null; });
  }

  return {
    boot: boot, mount: mount, setSwOn: setSwOn, unregister: unregister, pushCfg: pushCfg,
    live: function () { return live; }, prefix: PREFIX, swSource: swSource, registerSW: registerSW
  };
})();

/* =============================================================================
   21  wtrans  ::  native bare-mux transport over wisp-tls
   ============================================================================= */
const WTrans = (function () {
  const enc = new TextEncoder();

  function concat(a, b) {
    var m = new Uint8Array(a.length + b.length);
    m.set(a, 0); m.set(b, a.length);
    return m;
  }

  function BareWebSocket(stream) {
    this.binaryType = "arraybuffer";
    this.readyState = 1;
    this.onmessage = null;
    this.onclose = null;
    this.onopen = null;
    this._st = stream;
    const self = this;
    stream.onData = function (payload) {
      if (!self.onmessage) return;
      try { self.onmessage({ data: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) }); }
      catch (e) {}
    };
    stream.onClose = function (why) {
      self.readyState = 3;
      if (self.onclose) { try { self.onclose({ code: 1006, reason: why }); } catch (e) {} }
    };
  }

  BareWebSocket.prototype.send = function (data) {
    if (this._st.closed) return;
    var bytes;
    if (typeof data === "string") bytes = enc.encode(data);
    else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (data && data.buffer) bytes = new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
    else return;
    this._st.write(frame(1, bytes));
  };
  BareWebSocket.prototype.close = function () { this._st.close(); };
  BareWebSocket.prototype.addEventListener = function (k, fn) { this["on" + k] = fn; };

  function readAll(stream, max) {
    return new Promise(function (resolve, reject) {
      const chunks = [];
      let total = 0;
      stream.onData = function (p) {
        chunks.push(p);
        total += p.length;
        if (total > (max || 24 * 1024 * 1024)) stream.close();
      };
      stream.onClose = function (why) {
        if (!chunks.length && why !== "closed") return reject(new Error(why));
        let all = new Uint8Array(total), off = 0;
        chunks.forEach(function (c) { all.set(c, off); off += c.length; });
        resolve(all);
      };
    });
  }

  function headEnd(bytes) {
    for (let i = 3; i < bytes.length; i++) {
      if (bytes[i - 3] === 13 && bytes[i - 2] === 10 && bytes[i - 1] === 13 && bytes[i] === 10) return i + 1;
    }
    return -1;
  }

  function request(remote, method, body, headers, signal) {
    const ep = WispHTTP.endpoint();
    if (!ep) return Promise.reject(new Error("no worker"));
    const url = typeof remote === "string" ? new URL(remote) : remote;
    const port = url.port ? parseInt(url.port, 10) : (url.protocol === "https:" ? 443 : 80);

    return Wisp.openStream(ep, url.hostname, port, 1).then(function (st) {
      if (signal) signal.addEventListener("abort", function () { st.close(); });
      const lines = [
        (method || "GET") + " " + (url.pathname + url.search || "/") + " HTTP/1.1",
        "Host: " + url.hostname
      ];
      Object.keys(headers || {}).forEach(function (k) { lines.push(k + ": " + headers[k]); });
      lines.push("Connection: close", "", "");
      st.write(enc.encode(lines.join("\r\n")));

      if (body) {
        if (typeof body === "string") st.write(enc.encode(body));
        else if (body instanceof ArrayBuffer) st.write(new Uint8Array(body));
        else if (body && body.buffer) st.write(new Uint8Array(body.buffer));
        else if (body && typeof body === "object") {
          try { st.write(enc.encode(JSON.stringify(body))); } catch (e) {}
        }
      }

      return readAll(st).then(function (all) {
        const end = headEnd(all);
        if (end === -1) throw new Error("no response head");
        const head = new TextDecoder().decode(all.subarray(0, end)).split("\r\n");
        const statusLine = head.shift() || "";
        const m = statusLine.match(/^HTTP\/1\.[01]\s+(\d{3})\s*(.*)$/);
        if (!m) throw new Error("bad status line");
        const h = new Headers();
        head.forEach(function (l) {
          const i = l.indexOf(":");
          if (i > 0) { try { h.append(l.slice(0, i).trim(), l.slice(i + 1).trim()); } catch (e) {} }
        });
        let payload = all.subarray(end);
        if ((h.get("transfer-encoding") || "").indexOf("chunked") !== -1) {
          const out = [];
          let i = 0;
          while (i < payload.length) {
            let j = i;
            while (j < payload.length && !(payload[j] === 13 && payload[j + 1] === 10)) j++;
            const size = parseInt(new TextDecoder().decode(payload.subarray(i, j)), 16);
            if (isNaN(size) || size === 0) break;
            i = j + 2;
            out.push(payload.subarray(i, i + size));
            i += size + 2;
          }
          let t = 0;
          out.forEach(function (c) { t += c.length; });
          const merged = new Uint8Array(t);
          let o = 0;
          out.forEach(function (c) { merged.set(c, o); o += c.length; });
          payload = merged;
        }
        return new Response(payload, { status: parseInt(m[1], 10), statusText: m[2], headers: h });
      });
    });
  }

  function connect(port, host, protocol) {
    const ep = WispHTTP.endpoint();
    if (!ep) return Promise.reject(new Error("no worker"));
    return Wisp.openStream(ep, host, port, 1).then(function (st) {
      const key = btoa(String.fromCharCode.apply(null, Array.from(crypto.getRandomValues(new Uint8Array(16)))));
      const lines = [
        "GET / HTTP/1.1",
        "Host: " + host,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: " + key,
        "Sec-WebSocket-Version: 13",
        "User-Agent: Mozilla/5.0 (X11; CrOS x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Origin: https://" + host,
        "", ""
      ];
      st.write(enc.encode(lines.join("\r\n")));

      const ws = new BareWebSocket(st);
      let hsBuf = new Uint8Array(0);
      let partial = new Uint8Array(0);
      let handshook = false;
      let frag = [];

      function parse(chunk) {
        let buf = partial.length ? concat(partial, chunk) : chunk;
        partial = new Uint8Array(0);
        let i = 0;
        while (i + 2 <= buf.length) {
          const b1 = buf[i + 1];
          const masked = (b1 & 0x80) !== 0;
          let len = b1 & 0x7f;
          let off = 2;
          if (len === 126) {
            if (i + 4 > buf.length) { partial = buf.subarray(i); return; }
            len = (buf[i + 2] << 8) | buf[i + 3]; off = 4;
          } else if (len === 127) {
            if (i + 10 > buf.length) { partial = buf.subarray(i); return; }
            len = 0;
            for (let k = 0; k < 8; k++) len = len * 256 + buf[i + 2 + k];
            off = 10;
          }
          if (masked) off += 4;
          if (i + off + len > buf.length) { partial = buf.subarray(i); return; }
          const op = buf[i] & 0x0f;
          const data = buf.subarray(i + off, i + off + len);
          i += off + len;
          if (op === 8) {
            try { st.write(frame(8, data)); } catch (e) {}
            st.close();
            if (ws.onclose) { try { ws.onclose({ code: 1000 }); } catch (e) {} }
            return;
          }
          if (op === 9) { try { st.write(frame(10, data)); } catch (e) {} continue; }
          if (op === 10) continue;
          if (op === 1 || op === 2) {
            frag.push(data);
            if (ws.onmessage) {
              let all = frag[0];
              for (let f = 1; f < frag.length; f++) all = concat(all, frag[f]);
              frag = [];
              try { ws.onmessage({ data: all.buffer }); } catch (e) {}
            }
          }
        }
      }

      st.onData = function (payload) {
        if (!handshook) {
          hsBuf = concat(hsBuf, payload);
          const end = headEnd(hsBuf);
          if (end === -1) return;
          handshook = true;
          const rest = hsBuf.subarray(end);
          hsBuf = new Uint8Array(0);
          if (ws.onopen) { try { ws.onopen({}); } catch (e) {} }
          if (rest.length) parse(rest);
          return;
        }
        parse(payload);
      };

      st.onClose = function (why) { if (ws.onclose) ws.onclose({ code: 1006, reason: why }); };
      return ws;
    });
  }

  function frame(op, payload) {
    const len = payload.length;
    const mask = crypto.getRandomValues(new Uint8Array(4));
    let head;
    if (len < 126) { head = new Uint8Array(2); head[1] = 0x80 | len; }
    else if (len < 65536) { head = new Uint8Array(4); head[1] = 0x80 | 126; head[2] = len >> 8; head[3] = len & 255; }
    else { head = new Uint8Array(10); head[1] = 0x80 | 127; let l = len; for (let k = 9; k >= 2; k--) { head[k] = l & 255; l = Math.floor(l / 256); } }
    head[0] = 0x80 | op;
    const out = new Uint8Array(head.length + 4 + len);
    out.set(head, 0);
    out.set(mask, head.length);
    for (let i = 0; i < len; i++) out[head.length + 4 + i] = payload[i] ^ mask[i & 3];
    return out;
  }

  return {
    ready: false,
    init: function () { this.ready = true; return Promise.resolve(); },
    request: request, connect: connect, connectws: connect, frame: frame
  };
});

/* =============================================================================
   22  shim / shield / user scripts
   ============================================================================= */
const SHIM = [
"(function(){",
"var S=function(m){try{parent.postMessage(m,'*')}catch(e){}};",
"var A=function(h){try{return new URL(h,location.href).href}catch(e){return h}};",
"try{Object.defineProperty(window,'top',{get:function(){return window.self},configurable:true})}catch(e){}",
"try{Object.defineProperty(window,'frameElement',{get:function(){return null},configurable:true})}catch(e){}",
"(function(){var m={};try{var t='__t';localStorage.setItem(t,'1');localStorage.removeItem(t);return}catch(e){}",
"function M(){this.length=0}",
"M.prototype.getItem=function(k){return (k in m)?m[k]:null};",
"M.prototype.setItem=function(k,v){m[k]=String(v);this.length=Object.keys(m).length};",
"M.prototype.removeItem=function(k){delete m[k];this.length=Object.keys(m).length};",
"M.prototype.clear=function(){m={};this.length=0};",
"M.prototype.key=function(i){return Object.keys(m)[i]||null};",
"try{Object.defineProperty(window,'localStorage',{value:new M(),configurable:true})}catch(e){}",
"try{Object.defineProperty(window,'sessionStorage',{value:new M(),configurable:true})}catch(e){}",
"})();",
"document.addEventListener('click',function(e){",
"  var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;",
"  var h=a.getAttribute('href');if(!h||/^javascript:/i.test(h)||/^#/.test(h))return;",
"  var t=a.getAttribute('target');",
"  if(t&&t!=='_self'&&t!=='_top'&&t!=='_parent'){e.preventDefault();S({__v:'pop',href:A(h)});return}",
"  if(a.hasAttribute('download'))return;",
"  e.preventDefault();S({__v:'nav',href:A(h)});},true);",
"document.addEventListener('submit',function(e){",
"  var f=e.target;if(!f||f.tagName!=='FORM')return;",
"  var me=(f.getAttribute('method')||'get').toLowerCase();",
"  if(me!=='get'){e.preventDefault();S({__v:'nav',href:A(f.getAttribute('action')||location.href)});return}",
"  try{var u=new URL(f.getAttribute('action')||document.baseURI,document.baseURI);",
"  new FormData(f).forEach(function(v,k){if(typeof v==='string')u.searchParams.set(k,v)});",
"  e.preventDefault();S({__v:'nav',href:u.href})}catch(x){}},true);",
"window.open=function(u){if(u)S({__v:'pop',href:A(u)});return{focus:function(){},blur:function(){},close:function(){},closed:false}};",
"try{window.open.toString=function(){return 'function open() { [native code] }'}}catch(e){}",
"var P=history.pushState,R=history.replaceState;",
"function T(){S({__v:'title',title:document.title,href:location.href})}",
"history.pushState=function(){P.apply(history,arguments);T()};",
"history.replaceState=function(){R.apply(history,arguments);T()};",
"window.addEventListener('hashchange',T);",
"try{var _t=document.title,d=Object.getOwnPropertyDescriptor(Document.prototype,'title');",
"if(d&&d.set){Object.defineProperty(document,'title',{get:function(){return _t},set:function(v){_t=v;d.set.call(document,v);T()}})}}catch(e){}",
"setTimeout(T,60);setTimeout(T,900);setTimeout(T,2800);",
"try{var l=document.querySelector('link[rel~=\"icon\"]');if(l&&l.href)S({__v:'icon',href:l.href})}catch(e){}",
"try{['log','warn','error','info','debug'].forEach(function(k){",
"  var o=console[k];",
"  console[k]=function(){try{S({__v:'console',level:k,args:Array.prototype.slice.call(arguments).map(function(a){try{return typeof a==='object'?JSON.stringify(a).slice(0,400):String(a)}catch(e){return String(a)}})})}catch(e){};return o.apply(console,arguments)}})}catch(e){}",
"window.addEventListener('error',function(e){S({__v:'jserr',msg:String(e.message||''),line:e.lineno})});",
"window.addEventListener('unhandledrejection',function(e){S({__v:'jserr',msg:'rejection: '+String((e.reason&&e.reason.message)||e.reason)})});",
"window.__velaPick=function(){",
"  function ov(ev){var t=ev.target;if(!t||t.nodeType!==1)return;document.querySelectorAll('[data-vp]').forEach(function(n){n.removeAttribute('data-vp')});t.setAttribute('data-vp','1')}",
"  function ck(ev){ev.preventDefault();ev.stopPropagation();var t=ev.target;document.removeEventListener('mouseover',ov,true);document.removeEventListener('click',ck,true);",
"    var p=[];var n=t;while(n&&n.nodeType===1){var s=n.tagName.toLowerCase();if(n.id)s+='#'+n.id;else if(n.className&&typeof n.className==='string')s+='.'+n.className.trim().split(/\\s+/).slice(0,2).join('.');p.unshift(s);n=n.parentElement;if(p.length>6)break}",
"    S({__v:'picked',html:t.outerHTML.slice(0,4000),tag:t.tagName,cls:t.className,id:t.id,path:p.join(' > '),text:(t.textContent||'').trim().slice(0,300)})}",
"  document.addEventListener('mouseover',ov,true);document.addEventListener('click',ck,true)};",
"try{if(!document.querySelector('meta[name=\"viewport\"]')){var mv=document.createElement('meta');mv.name='viewport';mv.content='width=device-width,initial-scale=1';document.head.appendChild(mv)}}catch(e){}",
"document.addEventListener('DOMContentLoaded',function(){S({__v:'ready'})});",
"})();"
].join("\n");

const SHIELD = [
"html{-webkit-text-size-adjust:100%}",
"body{overscroll-behavior-y:none}",
"::-webkit-scrollbar{width:10px;height:10px}",
"::-webkit-scrollbar-thumb{background:rgba(128,128,128,.45);border-radius:10px}",
"::-webkit-scrollbar-track{background:transparent}",
"mark[data-vh]{background:rgba(255,214,0,.55)!important;color:inherit!important;border-radius:2px}",
"[data-vp]{outline:2px solid #4f8cff!important;outline-offset:-2px!important}",
"*{scrollbar-width:thin}"
].join("");

/* =============================================================================
   23  rewriter
   ============================================================================= */
const Rewriter = (function () {
  let wrap = function (u) { return u; };
  function setWrap(fn) { wrap = fn || function (u) { return u; }; }
  function abs(u, base) { try { return new URL(u, base).href; } catch (e) { return null; } }
  function skip(u) { return !u || SKIP.test(String(u).trim()); }

  function css(v, base) {
    if (!v) return v;
    let out = v.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (m, q, raw) {
      const t = raw.trim();
      if (skip(t)) return m;
      const a = abs(t, base);
      return a ? 'url("' + wrap(a) + '")' : m;
    });
    out = out.replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s;]+)\1\s*\)?/gi, function (m, q, raw) {
      if (skip(raw)) return m;
      const a = abs(raw, base);
      return a ? '@import url("' + wrap(a) + '")' : m;
    });
    return out;
  }

  function srcset(v, base) {
    return String(v).split(",").map(function (part) {
      const bits = part.trim().split(/\s+/);
      const u = bits.shift();
      if (!u || skip(u)) return part.trim();
      const a = abs(u, base);
      return a ? [wrap(a)].concat(bits).join(" ") : part.trim();
    }).join(", ");
  }

  const ATTRS = {
    img: ["src"], script: ["src"], video: ["src", "poster"], audio: ["src"], source: ["src"],
    embed: ["src"], iframe: ["src"], input: ["src"], track: ["src"], object: ["data"],
    use: ["href", "xlink:href"], form: ["action"], button: ["formaction"]
  };

  function assets(doc, base) {
    Object.keys(ATTRS).forEach(function (tag) {
      const as = ATTRS[tag];
      const ns = doc.getElementsByTagName(tag);
      for (let i = 0; i < ns.length; i++) {
        for (let a = 0; a < as.length; a++) {
          const v = ns[i].getAttribute(as[a]);
          if (skip(v)) continue;
          const x = abs(v, base);
          if (x) ns[i].setAttribute(as[a], wrap(x));
        }
      }
    });
    const ls = doc.querySelectorAll("link[href]");
    for (let i = 0; i < ls.length; i++) {
      const rel = (ls[i].getAttribute("rel") || "").toLowerCase();
      if (/preconnect|dns-prefetch|canonical|alternate|manifest|modulepreload/.test(rel) && !/stylesheet|icon|preload/.test(rel)) continue;
      const v = ls[i].getAttribute("href");
      if (skip(v)) continue;
      const x = abs(v, base);
      if (x) ls[i].setAttribute("href", wrap(x));
    }
    const ss = doc.querySelectorAll("[srcset]");
    for (let i = 0; i < ss.length; i++) {
      const v = ss[i].getAttribute("srcset");
      if (v) ss[i].setAttribute("srcset", srcset(v, base));
    }
    const st = doc.getElementsByTagName("style");
    for (let i = 0; i < st.length; i++) st[i].textContent = css(st[i].textContent, base);
    const inl = doc.querySelectorAll("[style]");
    for (let i = 0; i < inl.length; i++) inl[i].setAttribute("style", css(inl[i].getAttribute("style"), base));
  }

  function strip(doc) {
    const ms = doc.querySelectorAll("meta[http-equiv]");
    for (let i = 0; i < ms.length; i++) {
      const v = (ms[i].getAttribute("http-equiv") || "").toLowerCase();
      if (/content-security-policy|x-frame-options|^refresh$|cross-origin/.test(v)) ms[i].remove();
    }
    const is = doc.querySelectorAll("[integrity]");
    for (let i = 0; i < is.length; i++) is[i].removeAttribute("integrity");
    const bs = doc.querySelectorAll("base");
    for (let i = 0; i < bs.length; i++) bs[i].remove();
    if (UI.S.stealthScrub) {
      const m = doc.querySelectorAll("[data-scramjet],[data-sj]");
      for (let i = 0; i < m.length; i++) {
        m[i].removeAttribute("data-scramjet");
        m[i].removeAttribute("data-sj");
      }
    }
  }

  function head(doc) {
    let h = doc.head;
    if (!h) {
      h = doc.createElement("head");
      if (doc.documentElement) doc.documentElement.insertBefore(h, doc.documentElement.firstChild);
      else doc.appendChild(h);
    }
    return h;
  }

  function build(html, base, mode, opts) {
    opts = opts || {};
    const doc = new DOMParser().parseFromString(html, "text/html");
    strip(doc);
    const h = head(doc);
    if (mode === "deep" || mode === "inline") assets(doc, base);

    const cs = doc.createElement("meta");
    cs.setAttribute("charset", "utf-8");
    h.insertBefore(cs, h.firstChild);
    const b = doc.createElement("base");
    b.setAttribute("href", base);
    b.setAttribute("target", "_self");
    h.insertBefore(b, h.firstChild);

    const st = doc.createElement("style");
    st.textContent = SHIELD + (opts.extraCss || "");
    h.appendChild(st);

    const sh = doc.createElement("script");
    sh.textContent = SHIM;
    h.appendChild(sh);

    if (opts.zoom && opts.zoom !== 1) {
      const z = doc.createElement("style");
      z.textContent = "html{zoom:" + opts.zoom + "}";
      h.appendChild(z);
    }
    if (opts.userJs) {
      const uj = doc.createElement("script");
      uj.textContent = opts.userJs;
      h.appendChild(uj);
    }
    return "<!doctype html>" + doc.documentElement.outerHTML;
  }

  function inlineAll(html, base, opts) {
    opts = opts || {};
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.prototype.slice.call(doc.querySelectorAll('link[rel~="stylesheet"][href]'));
    const scripts = Array.prototype.slice.call(doc.querySelectorAll("script[src]"))
      .filter(function (s) { return (s.getAttribute("type") || "").toLowerCase() !== "module"; });
    const imgs = Array.prototype.slice.call(doc.querySelectorAll("img[src]")).slice(0, 60);
    const jobs = [];

    links.forEach(function (l) {
      const hh = l.getAttribute("href");
      if (skip(hh)) return;
      const a = abs(hh, base);
      if (!a) return;
      jobs.push(Fetcher.best(a, { timeout: CFG.t.sub, mode: "sub", boring: opts.boring }).then(function (r) {
        const st = doc.createElement("style");
        st.textContent = css(r.text, a);
        if (l.parentNode) l.parentNode.replaceChild(st, l);
      }).catch(function () {}));
    });
    scripts.forEach(function (sc) {
      const s = sc.getAttribute("src");
      if (skip(s)) return;
      const a = abs(s, base);
      if (!a) return;
      jobs.push(Fetcher.best(a, { timeout: CFG.t.sub, mode: "sub", boring: opts.boring }).then(function (r) {
        const n = doc.createElement("script");
        const t = sc.getAttribute("type");
        if (t) n.setAttribute("type", t);
        n.textContent = r.text + "\n//# sourceURL=" + a;
        if (sc.parentNode) sc.parentNode.replaceChild(n, sc);
      }).catch(function () {}));
    });
    imgs.forEach(function (im) {
      const s = im.getAttribute("src");
      if (skip(s)) return;
      const a = abs(s, base);
      if (!a) return;
      jobs.push(Fetcher.raw(a, { timeout: 8000 }).then(function (r) {
        if (!r.ok) return null;
        return r.blob();
      }).then(function (bl) {
        if (!bl) return;
        return new Promise(function (res) {
          const fr = new FileReader();
          fr.onload = function () { im.setAttribute("src", fr.result); res(); };
          fr.onerror = res;
          fr.readAsDataURL(bl);
        });
      }).catch(function () {}));
    });
    return Promise.all(jobs).then(function () { return { html: doc.documentElement.outerHTML, n: jobs.length }; });
  }

  return { build: build, inlineAll: inlineAll, setWrap: setWrap, css: css };
})();

/* =============================================================================
   24  renderer / 25 pane
   ============================================================================= */
const Renderer = (function () {
  let blobUrl = null, opaque = false;
  function sandbox() {
    let s = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation";
    if (!opaque) s += " allow-same-origin";
    return s;
  }
  function frame() {
    const f = document.createElement("iframe");
    f.setAttribute("name", UI.S.stealthScrub ? (CFG.frameName + rid(4)) : ("v" + rid(8)));
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("sandbox", sandbox());
    f.setAttribute("allow", "clipboard-write;fullscreen;autoplay;encrypted-media;picture-in-picture");
    if (UI.S.credless) { try { f.credentialless = true; } catch (e) {} }
    return f;
  }
  function revoke() { if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (e) {} blobUrl = null; } }
  function mount(host, spec) {
    revoke();
    host.innerHTML = "";
    host.classList.remove("sjhost");
    let f;
    if (spec.tr === "srcdoc") { f = frame(); f.srcdoc = spec.html; }
    else if (spec.tr === "blob") {
      blobUrl = URL.createObjectURL(new Blob([spec.html], { type: "text/html;charset=utf-8" }));
      f = frame(); f.src = blobUrl;
    } else if (spec.tr === "data") {
      f = frame(); f.src = "data:text/html;base64," + btoa(unescape(encodeURIComponent(spec.html)));
    } else if (spec.tr === "blank") {
      f = frame(); f.src = "about:blank";
      host.appendChild(f);
      const write = function () {
        try { const d = f.contentDocument; if (!d) return; d.open(); d.write(spec.html); d.close(); }
        catch (e) { try { f.srcdoc = spec.html; } catch (x) {} }
      };
      if (f.contentDocument) write(); else on(f, "load", write, { once: true });
      setTimeout(write, 40);
      return f;
    } else { f = frame(); f.src = spec.src; }
    host.appendChild(f);
    return f;
  }
  function wait(f, ms) {
    return new Promise(function (res) {
      let d = false;
      const fin = function () { if (!d) { d = true; res(); } };
      on(f, "load", function () { setTimeout(fin, 220); });
      setTimeout(fin, ms || 5400);
    });
  }
  return {
    mount: mount, wait: wait, revoke: revoke, frame: frame,
    setOpaque: function (v) { opaque = !!v; }, isOpaque: function () { return opaque; }
  };
})();

const Pane = (function () {
  function loaderHtml() {
    return '<div class="ldrbox"><div class="ldrorb"><div class="ring"></div><div class="ring"></div>' +
      '<div class="ring"></div><div class="core"></div></div>' +
      '<div class="ldrtxt">tunnelling</div><div class="ldrsteps"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="ldrsub">negotiating route</div></div>';
  }
  function make() {
    const p = el("div", "pane");
    const l = el("div", "ldr");
    l.innerHTML = loaderHtml();
    p.appendChild(l);
    return { pane: p, ldr: l };
  }
  function steps(p, n) { qsa(".ldrsteps i", p).forEach(function (d, i) { d.className = i < n ? "on" : ""; }); }
  function okSteps(p) { qsa(".ldrsteps i", p).forEach(function (d) { d.className = "ok"; }); }
  function txt(p, t) { const n = qs(".ldrtxt", p); if (n) n.textContent = t; }
  function sub(p, t) { const n = qs(".ldrsub", p); if (n) n.textContent = t; }
  function done(p) { const l = qs(".ldr", p); if (l) l.classList.add("gone"); }
  function reset(p) {
    p.classList.remove("sjhost");
    const l = qs(".ldr", p);
    if (!l) { const n = el("div", "ldr"); n.innerHTML = loaderHtml(); p.appendChild(n); }
    else l.classList.remove("gone");
    steps(p, 0);
  }
  return { make: make, steps: steps, okSteps: okSteps, txt: txt, sub: sub, done: done, reset: reset };
})();

/* =============================================================================
   26  tabs
   ============================================================================= */
const Tabs = (function () {
  const list = [];
  let activeId = null, seq = 0, strip = null;
  const SIDES = ["a", "b", "c", "d"];

  function init() { strip = $("tabs"); }
  function paneHost(side) { return $("vpane" + side.toUpperCase()); }

  function create(url, opts) {
    opts = opts || {};
    const side = opts.side || "a";
    const id = "t" + (++seq) + rid(4);
    const made = Pane.make();
    const rec = {
      id: id, url: url || "", title: opts.title || "New tab", icon: opts.icon || null,
      stack: [], ptr: -1, pane: made.pane, ldr: made.ldr, frame: null,
      scroll: 0, route: null, side: side, busy: false, timeline: []
    };
    (paneHost(side) || $("vpaneA")).appendChild(rec.pane);
    list.push(rec);
    paint();
    return rec;
  }
  function byId(id) { for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function active() { return byId(activeId); }
  function count() { return list.length; }
  function order() { return list.map(function (t) { return t.url; }).filter(Boolean); }
  function all() { return list; }

  function activate(id) {
    const rec = byId(id);
    if (!rec) return;
    const prev = active();
    if (prev) {
      prev.scroll = prev.pane.scrollTop;
      if (prev.side === rec.side) prev.pane.classList.remove("on");
    }
    activeId = id;
    rec.pane.classList.add("on");
    paint();
    Bus.emit("tab:active", rec);
    setTimeout(function () { rec.pane.scrollTop = rec.scroll || 0; }, 0);
  }
  function close(id) {
    const i = list.findIndex(function (t) { return t.id === id; });
    if (i === -1) return;
    const rec = list[i];
    if (rec.pane.parentNode) rec.pane.parentNode.removeChild(rec.pane);
    list.splice(i, 1);
    if (activeId === id) {
      const n = list[Math.min(i, list.length - 1)];
      if (n) activate(n.id); else activeId = null;
    }
    paint();
  }
  function push(rec, url, title) {
    if (rec.ptr < rec.stack.length - 1) rec.stack = rec.stack.slice(0, rec.ptr + 1);
    rec.stack.push({ url: url, title: title || url });
    rec.ptr = rec.stack.length - 1;
    if (rec.stack.length > 120) { rec.stack.shift(); rec.ptr--; }
  }
  function meta(rec, title, icon) {
    if (title) rec.title = cut(title, 62);
    if (icon) rec.icon = icon;
    paint();
  }
  function setBusy(rec, v) { rec.busy = !!v; paint(); }
  function mark(rec, url, route, ms) {
    rec.timeline.push({ url: url, route: route, ms: ms, ts: Date.now() });
    if (rec.timeline.length > 60) rec.timeline.shift();
  }

  function paint() {
    if (!strip) return;
    strip.innerHTML = "";
    list.forEach(function (rec, idx) {
      const t = el("div", "tab" + (rec.id === activeId ? " active" : "") + (rec.busy ? " busy" : "") +
        (rec.side !== "a" ? " side-b" : ""));
      t.draggable = true;
      t.setAttribute("data-idx", idx);
      const ic = document.createElement("img");
      ic.className = "tico";
      ic.src = rec.icon || Favicons.get("generic");
      ic.onerror = function () { ic.src = Favicons.get("generic"); };
      const dt = el("span", "tdot");
      const lb = el("span", "tlab", rec.title);
      const x = el("span", "tx");
      x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      t.appendChild(ic); t.appendChild(dt); t.appendChild(lb); t.appendChild(x);
      on(t, "click", function (e) { if (e.target === x || e.target.parentNode === x) return; activate(rec.id); });
      on(x, "click", function (e) { e.stopPropagation(); close(rec.id); });
      on(t, "auxclick", function (e) { if (e.button === 1) close(rec.id); });
      on(t, "dragstart", function (e) { t.classList.add("drag"); try { e.dataTransfer.setData("text/plain", String(idx)); } catch (x2) {} });
      on(t, "dragend", function () { t.classList.remove("drag"); qsa(".tab", strip).forEach(function (n) { n.classList.remove("over"); }); });
      on(t, "dragover", function (e) { e.preventDefault(); t.classList.add("over"); });
      on(t, "dragleave", function () { t.classList.remove("over"); });
      on(t, "drop", function (e) {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!isNaN(from) && list[from]) {
          const r = list.splice(from, 1)[0];
          list.splice(clamp(idx, 0, list.length), 0, r);
          paint();
        }
      });
      strip.appendChild(t);
    });
    const nb = el("button", "tnew");
    nb.title = "New tab (Alt+T)";
    nb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    on(nb, "click", function () { Bus.emit("tab:new"); });
    strip.appendChild(nb);
  }

  return {
    init: init, create: create, activate: activate, close: close, active: active, count: count,
    push: push, meta: meta, paint: paint, order: order, all: all, setBusy: setBusy, mark: mark
  };
})();

/* =============================================================================
   27  history / 28 marks / 29 cloaker
   ============================================================================= */
const History = (function () {
  let cache = [];
  function load() { return Store.listAll("history").then(function (a) { cache = a || []; return cache; }); }
  function record(url, title) {
    if (!url) return Promise.resolve();
    const rec = { id: hash(url) + "-" + Date.now(), url: url, title: title || phost(url), ts: Date.now() };
    cache.unshift(rec);
    if (cache.length > CFG.maxHistory) cache.length = CFG.maxHistory;
    return Store.listAdd("history", rec);
  }
  function search(q, n) {
    if (!q) return cache.slice(0, n || 40);
    return cache.map(function (h) { return { h: h, s: fuzzy(q, h.title + " " + h.url) }; })
      .filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; })
      .slice(0, n || 40).map(function (x) { return x.h; });
  }
  function recent(n) { return cache.slice(0, n || 8); }
  function clear() { cache = []; return Store.listClear("history"); }
  return { load: load, record: record, search: search, recent: recent, clear: clear, all: function () { return cache; } };
})();

const Marks = (function () {
  let cache = [];
  function load() { return Store.listAll("bookmarks").then(function (b) { cache = b || []; return cache; }); }
  function list() { return cache; }
  function has(url) { return cache.some(function (b) { return b.url === url; }); }
  function toggle(url, title) {
    if (has(url)) {
      return Store.listDel("bookmarks", url).then(function () { return load().then(function () { return false; }); });
    }
    return Store.listAdd("bookmarks", { url: url, title: title || phost(url), ts: Date.now() })
      .then(function () { return load().then(function () { return true; }); });
  }
  return { load: load, list: list, toggle: toggle, has: has };
})();

const Cloaker = (function () {
  let orig = document.title, linkEl = null, cur = "none", siteTitle = null, siteIcon = null;
  function init() {
    linkEl = $("favicon");
    if (!linkEl) { linkEl = document.createElement("link"); linkEl.rel = "icon"; linkEl.id = "favicon"; document.head.appendChild(linkEl); }
    orig = document.title;
  }
  function setIcon(h) { if (linkEl) linkEl.href = h; }
  function apply(id) {
    cur = id || "none";
    const d = DISGUISES.filter(function (x) { return x.id === cur; })[0];
    if (!d || d.id === "none") { document.title = orig; setIcon(Favicons.get("vela")); return; }
    if (d.title === "__SITE__") { document.title = siteTitle || orig; setIcon(siteIcon || Favicons.get("generic")); return; }
    document.title = d.title;
    setIcon(Favicons.get(d.icon));
  }
  function fromSite(t, i) {
    if (t) siteTitle = t;
    if (i) siteIcon = i;
    if (cur === "site") apply("site");
  }
  return { init: init, apply: apply, fromSite: fromSite, get: function () { return cur; }, setIcon: setIcon };
})();

/* =============================================================================
   30  decoy
   ============================================================================= */
const Decoy = (function () {
  let host = null, showing = false, cur = "classroom";
  function init() { host = $("decoy"); }
  const NAMES = [
    ["Algebra II", "Period 3 \u00b7 Room 214"], ["English 10", "Period 1 \u00b7 Ms. Reyes"],
    ["US History", "Period 5 \u00b7 Mr. Cole"], ["Chemistry", "Period 2 \u00b7 Lab 3"],
    ["Spanish III", "Period 4 \u00b7 Se\u00f1ora Diaz"], ["PE / Health", "Period 6 \u00b7 Gym B"],
    ["Geometry", "Period 7 \u00b7 Room 118"], ["Biology", "Period 8 \u00b7 Lab 1"]
  ];
  const COLS = ["#1a73e8","#7b1fa2","#00897b","#e8710a","#c2185b","#3f51b5","#00838f","#5d4037"];

  function classroom() {
    const cards = NAMES.map(function (c, i) {
      return '<div class="dccard" style="animation-delay:' + (i * 40) + 'ms"><div class="dccardh" style="background:' +
        COLS[i % COLS.length] + '"><h3>' + esc(c[0]) + '</h3><p>' + esc(c[1]) + '</p></div>' +
        '<div class="dccardf"><span>\uD83D\uDCCB</span><span>\uD83D\uDC65</span><span>\u22EF</span></div></div>';
    }).join("");
    return '<div class="dc"><div class="dctop"><div class="dcburger">\u2630</div><div class="dclogo"><b>Classroom</b></div>' +
      '<div class="dcsp"></div><div class="dcav">S</div></div><div class="dcbody"><h2 class="dch1">Classes</h2>' +
      '<div class="dcgrid">' + cards + '</div></div><div class="dcnote">Alt+X to return</div></div>';
  }
  function docs() {
    return '<div class="dc"><div class="dcbar"><div class="dclogo"><img src="' + Favicons.get("docs") + '" alt="">Untitled document</div>' +
      '<div class="dctitle">Untitled document<small>File &nbsp;Edit &nbsp;View &nbsp;Insert &nbsp;Format &nbsp;Tools &nbsp;Help</small></div>' +
      '<div class="dcsp"></div><div class="dctools"><span>\uD83D\uDCBE</span><span>\uD83D\uDC64</span><span>\uD83D\uDCAC</span><span>\u2601</span></div>' +
      '<div class="dcav">S</div></div><div class="dccanvas"><div class="dcpage"><h1>Chapter 7 Study Guide</h1>' +
      '<div class="meta">Last edit was 3 minutes ago &nbsp;|&nbsp; shared with 1 person</div>' +
      '<p>Answer each question in complete sentences. Use your notes from the unit and the assigned reading.</p>' +
      '<h2>Key Terms</h2><ul><li>Define the term and give one real-world example.</li>' +
      '<li>Explain how each term connects to the previous chapter.</li><li>Note any exceptions worth remembering.</li></ul>' +
      '<h2>Short Answer</h2><p>1. Summarise the main argument in your own words, then list two pieces of supporting evidence. <span class="dccaret"></span></p>' +
      '<p>2. Compare and contrast the two approaches discussed in class. Which is more <span class="dchl">reliable</span> and why?</p>' +
      '<h2>Long Answer</h2><p>3. In a well-developed paragraph, explain how these concepts apply outside of school. Include three specific details.</p>' +
      '<p>4. Identify one assumption the author makes and evaluate whether it holds up.</p>' +
      '<h2>Notes</h2><p>Unit test is next Thursday. Bring your review sheet and a pencil.</p></div></div></div>';
  }
  function drive() {
    const files = [["Chapter 7 Study Guide","docs"],["Lab Report Draft","docs"],["Unit 4 Slides","slides"],
      ["Budget Sheet","sheets"],["Essay Final","docs"],["Reading Notes","docs"]].map(function (f) {
      return '<div class="dcfile"><div class="thumb"><img src="' + Favicons.get(f[1]) + '" style="width:38px;height:38px" alt=""></div>' +
        '<div class="fname"><img src="' + Favicons.get(f[1]) + '" alt="">' + esc(f[0]) + '</div></div>';
    }).join("");
    return '<div class="dc"><div class="dctop"><div class="dcburger">\u2630</div>' +
      '<div class="dclogo"><img src="' + Favicons.get("drive") + '" alt="">Drive</div><div class="dcsp"></div><div class="dcav">S</div></div>' +
      '<div class="dcrowwrap"><div class="dcside"><div class="dcnew"><span>+</span>New</div>' +
      '<div class="dcnav"><a class="on">\uD83D\uDD52 My Drive</a><a>\uD83D\uDC65 Shared</a><a>\u23F1 Recent</a><a>\u2B50 Starred</a><a>\uD83D\uDDD1 Trash</a></div></div>' +
      '<div class="dcmain"><div class="dccrumb">My Drive <span>\u203A</span> School</div><div class="dcfiles">' + files + '</div></div></div></div>';
  }
  function gmail() {
    const mails = [["Ms. Reyes","Unit 4 essay feedback","Nice work on the thesis - tighten paragraph 3.","9:41 AM",1],
      ["Mr. Cole","Reading for Thursday","Pages 118-142. Short quiz.","8:12 AM",1],
      ["Counselor","Schedule change","Your request was approved.","Yesterday",1],
      ["Khan Academy","Weekly progress","3 of 5 mastery goals.","Yesterday",0],
      ["Mrs. Diaz","Vocab list 12","Attached. Quiz Friday.","Mon",0]].map(function (m) {
      return '<div class="dcmail' + (m[4] ? " unread" : "") + '"><div class="from">' + esc(m[0]) + '</div>' +
        '<div class="subj"><b>' + esc(m[1]) + '</b> <span class="snip">- ' + esc(m[2]) + '</span></div>' +
        '<div class="when">' + esc(m[3]) + '</div></div>';
    }).join("");
    return '<div class="dc"><div class="dctop"><div class="dcburger">\u2630</div>' +
      '<div class="dclogo"><img src="' + Favicons.get("gmail") + '" alt="">Gmail</div><div class="dcsp"></div><div class="dcav">S</div></div>' +
      '<div class="dcgmail"><div class="dcside"><div class="dcnew"><span>+</span>Compose</div>' +
      '<div class="dcnav"><a class="on">\uD83D\uDCE5 Inbox</a><a>\u2B50 Starred</a><a>\uD83D\uDCCE Sent</a><a>\uD83D\uDCDD Drafts</a></div></div>' +
      '<div class="dcmailwrap"><div class="dcmailtabs"><span class="on">Primary</span><span>Promotions</span></div>' + mails + '</div></div></div>';
  }
  function sheets() {
    const cols = ["","A","B","C","D","E","F","G"];
    const head = "<tr>" + cols.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr>";
    const data = [["Item","Qty","Price","Total"],["Notebook","2","3.50","7.00"],["Pencils","12","0.75","9.00"],
      ["Folder","3","1.25","3.75"],["Graph paper","1","4.00","4.00"],["Calculator","1","18.99","18.99"]];
    let rows = "";
    for (let r = 1; r <= 26; r++) {
      let cells = '<td class="rh">' + r + '</td>';
      for (let c = 0; c < 7; c++) {
        const v = (data[r - 1] && data[r - 1][c]) || "";
        cells += '<td' + (r === 2 && c === 0 ? ' class="sel"' : "") + '>' + esc(v) + '</td>';
      }
      rows += "<tr>" + cells + "</tr>";
    }
    return '<div class="dc"><div class="dcbar"><div class="dclogo"><img src="' + Favicons.get("sheets") + '" alt="">Untitled spreadsheet</div>' +
      '<div class="dcsp"></div><div class="dctools"><span>\uD83D\uDCBE</span><span>\u2601</span></div><div class="dcav">S</div></div>' +
      '<div class="dcsheetwrap"><table class="dcsheet"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function slides() {
    return '<div class="dc"><div class="dcbar"><div class="dclogo"><img src="' + Favicons.get("slides") + '" alt="">Untitled presentation</div>' +
      '<div class="dcsp"></div><div class="dcav">S</div></div><div class="dccanvas">' +
      '<div style="width:min(860px,90%);margin:0 auto;background:#fff;box-shadow:0 1px 4px rgba(60,64,67,.2);aspect-ratio:16/9;padding:56px 64px">' +
      '<div style="font-size:13px;color:#9aa0a6;margin-bottom:18px">Unit 4 \u00b7 The Cold War</div>' +
      '<div style="font-size:38px;font-weight:400;color:#202124;line-height:1.25">Causes and Consequences</div>' +
      '<div style="height:2px;width:80px;background:#f4b400;margin:22px 0"></div>' +
      '<div style="font-size:15px;color:#5f6368;line-height:1.8">\u2022 Post-war Europe &nbsp; \u2022 Containment &nbsp; \u2022 Proxy conflicts</div></div></div></div>';
  }
  function khan() {
    const cards = ["Algebra 2","Biology","US History","Grammar"].map(function (n) {
      return '<div class="dckhanCard"><div class="kh">\uD83D\uDCD8</div><div class="kb">' + esc(n) + '</div></div>';
    }).join("");
    return '<div class="dc"><div class="dckhanTop"><div class="dckhanLogo">Khan Academy</div>' +
      '<div class="dckhanNav"><span>Learners</span><span>Teachers</span><span>Courses</span></div>' +
      '<div class="dcsp"></div><div class="dcav">S</div></div>' +
      '<div class="dckhanHero"><h2>Keep going - you are 62% through Algebra 2</h2><p>3 mastery goals left.</p></div>' +
      '<div class="dckhanCards">' + cards + '</div></div>';
  }
  function clever() {
    const apps = [["Canvas","#e62429"],["IXL","#0b5b3f"],["Khan","#14bf96"],["Quizlet","#4255ff"],
      ["Desmos","#c74440"],["Nearpod","#1f6fd0"]];
    return '<div class="dc"><div class="dccleverTop"><div class="dccleverLogo">Clever</div>' +
      '<div class="dcsp"></div><div class="dcav" style="background:rgba(255,255,255,.25)">S</div></div>' +
      '<div class="dccleverBody"><h2>Good afternoon, Sam</h2><div class="dccleverGrid">' +
      apps.map(function (a) {
        return '<div class="dcapp"><div class="ic" style="background:' + a[1] + '">' + a[0][0] + '</div><div class="nm">' + esc(a[0]) + '</div></div>';
      }).join("") + '</div></div></div>';
  }
  function quizlet() {
    const sets = [["Unit 4 Vocabulary","32 terms"],["Chapter 7 Key Terms","24 terms"],["Spanish Verbs","48 terms"]];
    return '<div class="dc"><div class="dcqzTop"><div class="dcqzLogo">Quizlet</div>' +
      '<div class="dckhanNav"><span>Home</span><span>Your library</span></div><div class="dcsp"></div><div class="dcav">S</div></div>' +
      '<div class="dcqzBody"><h2>Your study sets</h2><div class="dcqzGrid">' +
      sets.map(function (s) { return '<div class="dcqzCard"><h4>' + esc(s[0]) + '</h4><p>' + esc(s[1]) + '</p></div>'; }).join("") +
      '</div></div></div>';
  }
  function desmos() {
    return '<div class="dc"><div class="dcdes"><div class="dcdesSide">' +
      '<div class="dcdesExpr"><span class="n">1</span>y=x^2-3</div>' +
      '<div class="dcdesExpr g"><span class="n">2</span>y=2x+1</div>' +
      '<div class="dcdesExpr"><span class="n">3</span>y=-1/2 x+4</div></div>' +
      '<div class="dcdesCanvas"><div class="dcdesAx"></div><div class="dcdesAx v"></div>' +
      '<svg viewBox="0 0 400 400" preserveAspectRatio="none">' +
      '<path d="M0 400 Q100 100 200 300 T400 0" stroke="#c74440" stroke-width="2.4" fill="none"/>' +
      '<path d="M0 350 L400 150" stroke="#2d70b3" stroke-width="2.4" fill="none"/></svg></div></div></div>';
  }
  function canvas() {
    const cs = [["Algebra II","#1f6fd0"],["English 10","#7b1fa2"],["Chemistry","#00897b"]];
    return '<div class="dc"><div class="dccvTop"><div class="dccvLogo">canvas</div>' +
      '<div class="dckhanNav"><span>Dashboard</span><span>Courses</span><span>Grades</span></div>' +
      '<div class="dcsp"></div><div class="dcav" style="background:#e62429">S</div></div>' +
      '<div class="dccvBody"><h2 class="dch1">Dashboard</h2><div class="dccvGrid">' +
      cs.map(function (c) {
        return '<div class="dccvCard"><div class="ch" style="background:' + c[1] + '">' + esc(c[0]) + '</div>' +
          '<div class="cb"><span>\uD83D\uDCCB Assignments</span><span>\uD83D\uDCDD Grades</span></div></div>';
      }).join("") + '</div></div></div>';
  }
  function schoology() {
    const cs = [["Algebra II","#1f6fd0"],["English 10","#6a1b9a"]];
    return '<div class="dc"><div class="dcscTop"><div class="dcscLogo">schoology</div>' +
      '<div class="dckhanNav" style="color:#cdd9ea"><span>Courses</span><span>Grades</span></div>' +
      '<div class="dcsp"></div><div class="dcav" style="background:rgba(255,255,255,.2)">S</div></div>' +
      '<div class="dcscBody"><h2 class="dch1">Courses</h2><div class="dcscGrid">' +
      cs.map(function (c) {
        return '<div class="dcscCard"><div class="sh" style="background:' + c[1] + '">' + esc(c[0][0]) + '</div>' +
          '<div class="sb">' + esc(c[0]) + '</div></div>';
      }).join("") + '</div></div></div>';
  }
  function blank() {
    return '<div class="dc"><div class="dcblank"><div class="bw"><h2>Nothing to see here</h2><p>Alt+X to bring the browser back</p></div></div></div>';
  }

  const R = {
    classroom: classroom, docs: docs, drive: drive, gmail: gmail, sheets: sheets, slides: slides,
    khan: khan, clever: clever, quizlet: quizlet, desmos: desmos, canvas: canvas, schoology: schoology, blank: blank
  };
  function show(kind) {
    if (kind) cur = kind;
    if (!host) host = $("decoy");
    host.innerHTML = (R[cur] || R.classroom)();
    host.classList.add("on");
    showing = true;
  }
  function hide() { if (!host) return; host.classList.remove("on"); showing = false; }
  function toggle(k) { if (showing) hide(); else show(k); }
  return { init: init, show: show, hide: hide, toggle: toggle, on: function () { return showing; }, cur: function () { return cur; } };
})();

/* =============================================================================
   31  finder / 32 reader
   ============================================================================= */
const Finder = (function () {
  let open = false, hits = [], idx = 0, q = "";
  function doc() {
    try {
      const r = Tabs.active();
      if (!r) return null;
      if (r.frame) { const d = r.frame.contentDocument; if (d && d.body) return d; }
      const f = r.pane.querySelector("iframe");
      if (f) { const d = f.contentDocument; if (d && d.body) return d; }
      return null;
    } catch (e) { return null; }
  }
  function clear(d) {
    try {
      qsa("mark[data-vh]", d).forEach(function (m) {
        const p = m.parentNode;
        if (!p) return;
        p.replaceChild(d.createTextNode(m.textContent), m);
        p.normalize();
      });
    } catch (e) {}
  }
  function run(text) {
    const d = doc();
    q = text; hits = []; idx = 0;
    if (!d || !q) { count(); return; }
    clear(d);
    const lq = q.toLowerCase();
    const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const t = n.parentNode && n.parentNode.nodeName;
        if (t === "SCRIPT" || t === "STYLE" || t === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = w.nextNode())) if (n.nodeValue.toLowerCase().indexOf(lq) !== -1) nodes.push(n);
    nodes.forEach(function (node) {
      const val = node.nodeValue;
      const frag = d.createDocumentFragment();
      let i = 0;
      while (i < val.length) {
        const f = val.toLowerCase().indexOf(lq, i);
        if (f === -1) { frag.appendChild(d.createTextNode(val.slice(i))); break; }
        if (f > i) frag.appendChild(d.createTextNode(val.slice(i, f)));
        const mk = d.createElement("mark");
        mk.setAttribute("data-vh", "1");
        mk.textContent = val.slice(f, f + q.length);
        frag.appendChild(mk);
        i = f + q.length;
      }
      const holder = d.createElement("span");
      holder.appendChild(frag);
      node.parentNode.replaceChild(holder, node);
      qsa("mark[data-vh]", holder).forEach(function (m) { hits.push(m); });
    });
    count();
    if (hits.length) focus(0);
  }
  function focus(i) {
    hits.forEach(function (h, n) { h.style.outline = n === i ? "2px solid #1a73e8" : "none"; });
    const h = hits[i];
    if (h && h.scrollIntoView) { try { h.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { h.scrollIntoView(); } }
  }
  function next() { if (!hits.length) return; idx = (idx + 1) % hits.length; focus(idx); count(); }
  function prev() { if (!hits.length) return; idx = (idx - 1 + hits.length) % hits.length; focus(idx); count(); }
  function count() { const c = $("findCount"); if (c) c.textContent = hits.length ? (idx + 1) + "/" + hits.length : "0/0"; }
  function openBar() { open = true; $("find").classList.add("open"); const i = $("findInput"); if (i) { i.focus(); i.select(); } }
  function closeBar() { open = false; $("find").classList.remove("open"); const d = doc(); if (d) clear(d); hits = []; count(); }
  return { run: run, next: next, prev: prev, open: openBar, close: closeBar, isOpen: function () { return open; }, refresh: function () { if (q) run(q); } };
})();

const Reader = (function () {
  const CSS = "html{background:#fbfaf7}body{margin:0;padding:56px 24px 100px;font-family:Georgia,serif;font-size:18px;" +
    "line-height:1.75;color:#1c1c1c}.rv{max-width:720px;margin:0 auto}.rv h1{font-size:32px;margin:0 0 28px}" +
    ".rv h2{font-size:21px;margin:36px 0 12px}.rv p{margin:0 0 20px}.rv li{margin:0 0 10px;margin-left:22px}";
  function toggle() {
    const rec = Tabs.active();
    if (!rec) return;
    if (document.body.classList.contains("reader")) { document.body.classList.remove("reader"); Bus.emit("tab:reload"); return; }
    let d;
    try {
      const f = rec.frame || rec.pane.querySelector("iframe");
      d = f && f.contentDocument;
    } catch (e) { d = null; }
    if (!d || !d.body) { Toast.warn("Reader mode", "frame is cross-origin here"); return; }
    const clone = d.body.cloneNode(true);
    qsa("script,style,noscript,svg,iframe,nav,header,footer,aside,form,button", clone).forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    const ps = qsa("p,li,h1,h2,h3,h4,blockquote,pre", clone)
      .map(function (n) { return { t: n.tagName.toLowerCase(), x: (n.textContent || "").trim() }; })
      .filter(function (p) { return p.x.length > 26; });
    if (ps.length < 3) { Toast.warn("Reader mode", "not enough article text"); return; }
    let html = d.title ? "<h1>" + esc(d.title) + "</h1>" : "";
    ps.forEach(function (p) {
      if (/^h[1-4]$/.test(p.t)) html += "<h2>" + esc(p.x) + "</h2>";
      else if (p.t === "li") html += "<li>" + esc(p.x) + "</li>";
      else html += "<p>" + esc(p.x) + "</p>";
    });
    document.body.classList.add("reader");
    const f = Renderer.frame();
    f.srcdoc = "<!doctype html><html><head><meta charset='utf-8'><style>" + CSS +
      "</style></head><body><div class='rv'>" + html + "</div></body></html>";
    rec.pane.innerHTML = "";
    rec.pane.appendChild(f);
    rec.frame = f;
    Toast.ok("Reader mode", cut(d.title || "article", 40));
  }
  return { toggle: toggle };
})();

/* =============================================================================
   33  tools / 34 downloads / 35 rules / 36 intercept
   ============================================================================= */
const Tools = (function () {
  const conRows = [];
  function conPush(level, args) {
    conRows.unshift({ level: level, args: args, ts: Date.now() });
    if (conRows.length > 300) conRows.pop();
    renderConsole();
  }
  function renderConsole() {
    const b = $("consoleBody");
    if (!b) return;
    b.innerHTML = conRows.slice(0, 160).map(function (r) {
      const cls = r.level === "err" ? "err" : r.level === "warn" ? "warn" : (r.level === "in" ? "in" : (r.level === "out" ? "out" : "log"));
      return '<div class="conrow ' + cls + '"><span class="cl">' + esc(r.level === "err" ? "error" : r.level) + '</span>' +
        '<span class="cm">' + esc(Array.isArray(r.args) ? r.args.join(" ") : String(r.args)) + '</span></div>';
    }).join("");
  }
  function activeDoc() {
    const rec = Tabs.active();
    if (!rec) return null;
    try {
      const f = rec.frame || rec.pane.querySelector("iframe");
      return f && f.contentDocument;
    } catch (e) { return null; }
  }
  function source() {
    const rec = Tabs.active();
    const url = (rec && rec.url) || UI.lastUrl();
    const b = $("sourceBody");
    if (!b || !url) return;
    b.textContent = "fetching...";
    Modal.open("mSource");
    Fetcher.best(url, { mode: "src", noCache: true }).then(function (r) { b.innerHTML = highlight(r.text); })
      .catch(function (e) { b.textContent = "could not fetch: " + e.message; });
  }
  function highlight(html) {
    let out = esc(html);
    out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="cm">$1</span>');
    out = out.replace(/(&lt;\/?)([a-zA-Z][\w:-]*)/g, '$1<span class="tg">$2</span>');
    out = out.replace(/([a-zA-Z-:]+)=(&quot;[^&]*?&quot;)/g, '<span class="at">$1</span>=<span class="st">$2</span>');
    out = out.replace(/\b(function|var|let|const|return|if|else|for|while|new|this|try|catch)\b/g, '<span class="kw">$1</span>');
    return out;
  }
  function print() {
    const d = activeDoc();
    if (!d) { Toast.warn("Print", "frame not reachable"); return; }
    try { d.defaultView.print(); } catch (e) { Toast.warn("Print", e.message); }
  }
  function pick() {
    const d = activeDoc();
    if (!d || !d.defaultView || !d.defaultView.__velaPick) { Toast.warn("Inspect", "frame not reachable"); return; }
    Modal.open("mInspect");
    $("inspectBody").innerHTML = '<div class="palempty">Click anything on the page.</div>';
    try { d.defaultView.__velaPick(); } catch (e) { Toast.warn("Inspect", e.message); }
  }
  function showInspect(d) {
    const b = $("inspectBody");
    if (!b) return;
    b.innerHTML = '<div class="insbox"><div class="tag">&lt;' + esc(d.tag) + '&gt;</div>' +
      '<div class="att"><b>path</b> ' + esc(d.path) + '<br>' +
      (d.id ? '<b>id</b> ' + esc(d.id) + '<br>' : '') + (d.cls ? '<b>class</b> ' + esc(d.cls) : '') + '</div>' +
      (d.text ? '<div class="txt">' + esc(d.text) + '</div>' : '') + '</div>' +
      '<div class="palgrp">outer html</div><div class="wcode">' + esc(d.html) + '</div>';
  }

  let sock = null;
  function sockLog(cls, text) {
    const l = $("sockLog");
    if (!l) return;
    l.appendChild(el("div", cls, text));
    l.scrollTop = l.scrollHeight;
  }
  function sockConnect() {
    const h = ($("sockHost") || {}).value;
    const p = parseInt(($("sockPort") || {}).value || "443", 10);
    if (!h) return;
    const ep = WispHTTP.endpoint();
    if (!ep) { sockLog("sys", "no worker configured"); return; }
    sockLog("sys", "connecting " + h + ":" + p);
    Wisp.openStream(ep, h, p, 1).then(function (st) {
      sock = st;
      sockLog("sys", "connected");
      st.onData = function (bytes) {
        let s = "";
        for (let i = 0; i < bytes.length; i++) {
          const c = bytes[i];
          s += (c >= 32 && c < 127) ? String.fromCharCode(c) : (c === 10 ? "\n" : (c === 13 ? "" : "\u00b7"));
        }
        sockLog("out", s);
      };
      st.onClose = function (why) { sockLog("sys", "closed: " + why); sock = null; };
    }).catch(function (e) { sockLog("sys", "failed: " + e.message); });
  }
  function sockWrite() {
    if (!sock) { sockLog("sys", "not connected"); return; }
    const v = ($("sockSend") || {}).value || "";
    sockLog("in", v);
    sock.write(new TextEncoder().encode(v.replace(/\\r/g, "\r").replace(/\\n/g, "\n")));
  }
  function sockClose() { if (sock) { sock.close(); sock = null; sockLog("sys", "disconnected"); } }

  return {
    conPush: conPush, renderConsole: renderConsole, source: source, print: print, pick: pick,
    showInspect: showInspect, activeDoc: activeDoc, highlight: highlight,
    sockConnect: sockConnect, sockWrite: sockWrite, sockClose: sockClose
  };
})();

const Downloads = (function () {
  let list = [];
  function load() { return Store.listAll("downloads").then(function (d) { list = d || []; return list; }); }
  function capture(d) {
    const rec = { id: rid(10), url: d.url || "", name: d.filename || "download", ts: Date.now(), size: 0, state: "started" };
    list.unshift(rec);
    Store.listAdd("downloads", rec);
    Bus.emit("dl:new", rec);
    Toast.ok("Download started", cut(rec.name, 40));
    const a = document.createElement("a");
    a.href = rec.url;
    a.download = rec.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 300);
  }
  function all() { return list; }
  function clear() {
    list = list.filter(function (d) { return d.state !== "done"; });
    return Store.listClear("downloads");
  }
  return { load: load, capture: capture, all: all, clear: clear };
})();

const Rules = (function () {
  let map = Object.create(null);
  function load() { return Store.get("rules", {}).then(function (m) { if (m && typeof m === "object") map = m; }); }
  function get(h) { return map[h] || null; }
  function set(h, rule) {
    if (!rule) delete map[h]; else map[h] = rule;
    return Store.set("rules", map);
  }
  function all() { return map; }
  return { load: load, get: get, set: set, all: all };
})();

const Intercept = (function () {
  let list = [];
  function load() { return Store.get("intercept", []).then(function (l) { list = Array.isArray(l) ? l : []; }); }
  function all() { return list; }
  function test(url) {
    for (let i = 0; i < list.length; i++) {
      try { if (new RegExp(list[i].re).test(url)) return list[i]; } catch (e) {}
    }
    return null;
  }
  function save(l) { list = l; return Store.set("intercept", l); }
  return { load: load, all: all, test: test, save: save };
})();

/* =============================================================================
   37  stealth
   ============================================================================= */
const Stealth = (function () {
  const SIGS = [
    { re: /rewriteHTML\s*\(/, label: "rewriteHTML(" },
    { re: /rewriteCSS\s*\(/, label: "rewriteCSS(" },
    { re: /rewriteJS\s*\(/, label: "rewriteJS(" },
    { re: /proxyUrl\s*\(/, label: "proxyUrl(" },
    { re: /unproxyUrl\s*\(/, label: "unproxyUrl(" },
    { re: /\$scramjet/, label: "$scramjet" },
    { re: /ScramjetController/, label: "ScramjetController" },
    { re: /BareMux/, label: "BareMux" },
    { re: /serviceWorker\.register\(\s*["'][^"']*sw\.js/, label: "register('sw.js')" }
  ];
  function scrubGlobals() {
    if (!UI.S.stealthScrub) return;
    ["$scramjetLoadWorker", "$scramjetLoadController", "$scramjet"].forEach(function (k) {
      if (k in global) { try { delete global[k]; } catch (e) { global[k] = undefined; } }
    });
  }
  function hardenBuiltins() {
    if (!UI.S.nativeify) return;
    try { const of = global.fetch; global.fetch = nativeify(function () { return of.apply(global, arguments); }, "fetch"); } catch (e) {}
    try {
      const oa = global.atob, ob = global.btoa;
      global.atob = nativeify(function (s) { return oa.call(global, s); }, "atob");
      global.btoa = nativeify(function (s) { return ob.call(global, s); }, "btoa");
    } catch (e) {}
    try {
      const oe = global.eval;
      if (oe && oe.toString && oe.toString().indexOf("[native code]") === -1) nativeify(oe, "eval");
    } catch (e) {}
  }
  function selfTest() {
    const text = qsa("script").map(function (s) { return s.src ? s.src : (s.textContent || ""); }).join("\n");
    const hits = [];
    SIGS.forEach(function (s) { if (s.re.test(text)) hits.push(s.label); });
    const natives = [];
    ["atob", "btoa", "fetch"].forEach(function (k) {
      try {
        const f = global[k];
        const s = f ? Function.prototype.toString.call(f) : "";
        natives.push({ k: k, native: s.indexOf("[native code]") !== -1 });
      } catch (e) {}
    });
    return { hits: hits, natives: natives };
  }
  function score() {
    let s = 26;
    const S = UI.S;
    if (S.hard) s += 14;
    if (S.paranoid) s += 8;
    if (S.stealthScrub) s += 10;
    if (S.nativeify) s += 6;
    if (Fleet.live().length) s += 18;
    if (WispHTTP.available()) s += 12;
    if (S.transportEngine === "native") s += 4;
    if (S.swOn && SJ.live()) s += 6;
    if (S.route === "auto" || /ghost|stealth|srcdoc|airgap|opaque/.test(S.route)) s += 8;
    if (S.route === "direct" || S.route === "src") s -= 6;
    if (S.boringBias) s += 3;
    if (S.cacheBust) s += 3;
    if (S.trans === "relay") s -= 7;
    if (S.trans === "direct") s -= 10;
    if (location.protocol === "file:") s -= 8;
    if (S.opaque) s += 3;
    return clamp(Math.round(s), 0, 100);
  }
  function label(v) {
    if (v >= 82) return "invisible";
    if (v >= 62) return "strong";
    if (v >= 42) return "ok";
    if (v >= 24) return "thin";
    return "exposed";
  }
  function order() {
    if (UI.S.paranoid) return PARANOID_ORDER;
    if (UI.S.hard) return HARD_ORDER;
    return AUTO_ORDER;
  }
  return { scrubGlobals: scrubGlobals, hardenBuiltins: hardenBuiltins, selfTest: selfTest, score: score, label: label, order: order };
})();

/* =============================================================================
   38  workergen
   ============================================================================= */
const WorkerGen = (function () {
  let paths = null;
  function reroll() {
    paths = {
      ping: "/" + rid(5),
      ws: "/" + rid(7) + "/",
      wss: "/" + rid(7) + "tls/",
      get: "/" + rid(6),
      dns: "/" + rid(6)
    };
    return paths;
  }
  function code() {
    if (!paths) reroll();
    return [
"// ===================================================================",
"// VELA 13 tunnel worker",
"// deploy: dash.cloudflare.com -> Workers & Pages -> Create -> paste -> Deploy",
"// then paste https://<you>.workers.dev into the worker box in the app",
"// ===================================================================",
"//   wss://<you>.workers.dev" + paths.ws + "     raw TCP   (scramjet / libcurl)",
"//   wss://<you>.workers.dev" + paths.wss + "    server-side TLS, plain HTTP inside",
"//   https://<you>.workers.dev" + paths.get + "?url=   relay, DNS resolved in Cloudflare",
"//   https://<you>.workers.dev" + paths.dns + "?name=  DoH passthrough",
"// ===================================================================",
"",
"import { connect } from 'cloudflare:sockets';",
"",
"const PKT = { CONNECT: 1, DATA: 2, CONTINUE: 3, CLOSE: 4, INFO: 5 };",
"const BUF = 64;",
"",
"const STRIP = [",
"  'content-security-policy','content-security-policy-report-only','x-frame-options',",
"  'cross-origin-embedder-policy','cross-origin-opener-policy','cross-origin-resource-policy',",
"  'permissions-policy','strict-transport-security','report-to','nel','alt-svc','set-cookie',",
"  'content-encoding','content-length'",
"];",
"const CORS = {",
"  'access-control-allow-origin': '*',",
"  'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS',",
"  'access-control-allow-headers': '*',",
"  'access-control-expose-headers': '*',",
"  'access-control-max-age': '86400'",
"};",
"",
"const u32 = function (v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };",
"",
"function frame(type, sid, payload) {",
"  const head = new Uint8Array(5);",
"  head[0] = type;",
"  new DataView(head.buffer).setUint32(1, sid, true);",
"  if (!payload || !payload.length) return head;",
"  const out = new Uint8Array(5 + payload.length);",
"  out.set(head, 0);",
"  out.set(payload, 5);",
"  return out;",
"}",
"",
"function wispUpgrade(doTls) {",
"  const pair = new WebSocketPair();",
"  const client = pair[0];",
"  const server = pair[1];",
"  server.accept();",
"  const streams = new Map();",
"",
"  function send(t, sid, p) { try { server.send(frame(t, sid, p)); } catch (e) {} }",
"  send(PKT.CONTINUE, 0, u32(BUF));",
"",
"  function kill(sid, reason) {",
"    const s = streams.get(sid);",
"    if (!s) return;",
"    streams.delete(sid);",
"    try { s.writer.close(); } catch (e) {}",
"    try { s.reader.cancel(); } catch (e) {}",
"    if (reason) send(PKT.CLOSE, sid, new Uint8Array([reason]));",
"  }",
"",
"  async function onMsg(ev) {",
"    const buf = new Uint8Array(ev.data);",
"    if (buf.length < 5) return;",
"    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);",
"    const type = buf[0];",
"    const sid = dv.getUint32(1, true);",
"    const payload = buf.subarray(5);",
"",
"    if (type === PKT.CONNECT) {",
"      if (payload.length < 4) return send(PKT.CLOSE, sid, new Uint8Array([0x41]));",
"      const port = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint16(1, true);",
"      const hostname = new TextDecoder().decode(payload.subarray(3));",
"      if (!hostname || !port) return send(PKT.CLOSE, sid, new Uint8Array([0x41]));",
"      const secure = (doTls && (port === 443 || port === 8443)) ? 'on' : 'off';",
"      let socket;",
"      try { socket = connect({ hostname: hostname, port: port }, { secureTransport: secure }); }",
"      catch (e) { return send(PKT.CLOSE, sid, new Uint8Array([0x41])); }",
"      const writer = socket.writable.getWriter();",
"      const reader = socket.readable.getReader();",
"      streams.set(sid, { socket: socket, writer: writer, reader: reader });",
"      send(PKT.CONTINUE, sid, u32(BUF));",
"      (async function pump() {",
"        try {",
"          for (;;) {",
"            const r = await reader.read();",
"            if (r.done) break;",
"            const c = r.value instanceof Uint8Array ? r.value : new Uint8Array(r.value);",
"            if (c.length) send(PKT.DATA, sid, c);",
"          }",
"          kill(sid, 0x02);",
"        } catch (e) { kill(sid, 0x03); }",
"      })();",
"      return;",
"    }",
"    if (type === PKT.DATA) {",
"      const s = streams.get(sid);",
"      if (!s) return;",
"      try { await s.writer.write(payload); } catch (e) { kill(sid, 0x03); }",
"      return;",
"    }",
"    if (type === PKT.CLOSE) return kill(sid, 0);",
"  }",
"",
"  server.addEventListener('message', function (ev) { onMsg(ev); });",
"  server.addEventListener('close', function () { Array.from(streams.keys()).forEach(function (s) { kill(s, 0); }); });",
"  return new Response(null, { status: 101, webSocket: client });",
"}",
"",
"function targetOf(url) {",
"  let raw = url.searchParams.get('url') || url.searchParams.get('u');",
"  if (!raw) return null;",
"  if (!/^https?:\\/\\//i.test(raw)) raw = 'https://' + raw;",
"  try { return new URL(raw).href; } catch (e) { return null; }",
"}",
"",
"function clean(src, extra) {",
"  const h = new Headers();",
"  for (const [k, v] of src.entries()) { if (STRIP.indexOf(k.toLowerCase()) !== -1) continue; h.set(k, v); }",
"  for (const k in extra) h.set(k, extra[k]);",
"  return h;",
"}",
"",
"function css(c, base, origin) {",
"  return c.replace(/url\\(\\s*['\\\"]?([^'\\\")]+)['\\\"]?\\s*\\)/gi, function (m, u) {",
"    if (/^(data:|blob:|#|https?:\\/\\/)/i.test(u)) return m;",
"    try { return 'url(\\\"' + origin + '" + paths.get + "?url=' + encodeURIComponent(new URL(u, base).href) + '\\\")'; }",
"    catch (e) { return m; }",
"  });",
"}",
"",
"async function relay(request, url) {",
"  const t = targetOf(url);",
"  if (!t) return new Response('vela relay :: ?url=https://example.com', { headers: Object.assign({ 'content-type': 'text/plain' }, CORS) });",
"  const fh = new Headers();",
"  fh.set('user-agent', request.headers.get('user-agent') || 'Mozilla/5.0 (X11; CrOS x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');",
"  fh.set('accept', request.headers.get('accept') || '*/*');",
"  fh.set('accept-language', request.headers.get('accept-language') || 'en-US,en;q=0.9');",
"  const r = request.headers.get('range');",
"  if (r) fh.set('range', r);",
"  const ip = url.searchParams.get('ip');",
"  const opts = { method: request.method, headers: fh, redirect: 'follow' };",
"  const cf = { cacheTtl: 30, cacheEverything: true, scrapeShield: false };",
"  if (ip) cf.resolveOverride = ip;",
"  opts.cf = cf;",
"  let up;",
"  try { up = await fetch(t, opts); } catch (e) { return new Response('upstream: ' + e.message, { status: 502, headers: CORS }); }",
"  const h = clean(up.headers, CORS);",
"  const ty = (h.get('content-type') || '').toLowerCase();",
"  if (ty.indexOf('text/html') !== -1 || ty.indexOf('application/xhtml') !== -1) {",
"    let b = await up.text();",
"    const inj = '<base href=\\\"' + t + '\\\" target=\\\"_self\\\">';",
"    if (/<head[^>]*>/i.test(b)) b = b.replace(/<head([^>]*)>/i, '<head$1>' + inj);",
"    else b = inj + b;",
"    h.set('content-type', 'text/html; charset=utf-8');",
"    return new Response(b, { status: up.status, headers: h });",
"  }",
"  if (ty.indexOf('text/css') !== -1) {",
"    h.set('content-type', 'text/css; charset=utf-8');",
"    return new Response(css(await up.text(), t, url.origin), { status: up.status, headers: h });",
"  }",
"  return new Response(up.body, { status: up.status, headers: h });",
"}",
"",
"export default {",
"  async fetch(request) {",
"    const url = new URL(request.url);",
"    const p = url.pathname;",
"    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });",
"    if (p === '" + paths.ping + "' || p === '/__ping') return new Response('vela-ok', { headers: CORS });",
"    if (p.indexOf('" + paths.wss.replace(/\/$/, "") + "') === 0) return wispUpgrade(true);",
"    if (p.indexOf('" + paths.ws.replace(/\/$/, "") + "') === 0) return wispUpgrade(false);",
"    if (p === '" + paths.dns + "') {",
"      const n = url.searchParams.get('name');",
"      const ty = url.searchParams.get('type') || 'A';",
"      if (!n) return new Response('{}', { headers: Object.assign({ 'content-type': 'application/json' }, CORS) });",
"      const d = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(n) + '&type=' + encodeURIComponent(ty), { headers: { accept: 'application/dns-json' } });",
"      return new Response(await d.text(), { headers: Object.assign({ 'content-type': 'application/json' }, CORS) });",
"    }",
"    if (p === '/' && !url.searchParams.get('url')) {",
"      return new Response('<!doctype html><meta charset=utf-8><title>tunnel</title>' +",
"        '<body style=\\\"font:14px system-ui;background:#0a1120;color:#c3cfe6;padding:40px;line-height:1.9\\\">' +",
"        '<h1 style=\\\"font-size:17px\\\">tunnel up</h1>' +",
"        '<p>wisp: <code>wss://' + url.host + paths.ws + '</code></p>' +",
"        '<p>wisp tls: <code>wss://' + url.host + paths.wss + '</code></p>' +",
"        '<p>relay: <code>https://' + url.host + paths.get + '?url=</code></p>' +",
"        '<p>dns: <code>https://' + url.host + paths.dns + '?name=</code></p>' +",
"        '<p style=\\\"color:#57678a\\\">paste <b>https://' + url.host + '</b> into the worker box.</p>',",
"        { headers: Object.assign({ 'content-type': 'text/html; charset=utf-8' }, CORS) });",
"    }",
"    return relay(request, url);",
"  }",
"};"
    ].join("\n");
  }
  function copy() {
    const t = code();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { Toast.ok("Copied", "worker code on your clipboard"); }, function () { fb(t); });
    } else fb(t);
  }
  function fb(t) {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); Toast.ok("Copied"); } catch (e) { Toast.warn("Copy failed"); }
    document.body.removeChild(ta);
  }
  function download() {
    const b = new Blob([code()], { type: "text/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "vela-worker.js";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 200);
  }
  function swDownload() {
    const b = new Blob([SJ.swSource()], { type: "text/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = CFG.swFile;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 200);
  }
  return { code: code, copy: copy, download: download, swDownload: swDownload, reroll: reroll, paths: function () { return paths; } };
})();

/* =============================================================================
   39  palette / 40 fx / 41 radar
   ============================================================================= */
const Palette = (function () {
  let open = false, items = [], sel = 0, host = null, input = null, list = null;
  function cmds() {
    const c = [
      { id: "new", label: "New tab", hint: "Alt+T", icon: "plus", run: function () { Bus.emit("tab:new"); } },
      { id: "rel", label: "Reload page", hint: "Alt+R", icon: "refresh", run: function () { Bus.emit("tab:reload"); } },
      { id: "full", label: "Toggle maximise", hint: "Alt+F", icon: "grid", run: function () { UI.full(); } },
      { id: "panic", label: "Toggle decoy screen", hint: "Alt+X", icon: "eye", run: function () { Decoy.toggle(); } },
      { id: "hard", label: "Toggle hardened mode", hint: "Alt+L", icon: "shield", run: function () { UI.hardToggle(); } },
      { id: "paranoid", label: "Toggle paranoid mode", hint: "Alt+Shift+L", icon: "shield", run: function () { UI.paranoidToggle(); } },
      { id: "fleet", label: "Worker fleet", hint: "Alt+M", icon: "fleet", run: function () { UI.fleet(); } },
      { id: "worker", label: "Deploy a worker", hint: "", icon: "code", run: function () { UI.worker(); } },
      { id: "save", label: "Save a local copy", hint: "Alt+S", icon: "down", run: function () { UI.saveCopy(); } },
      { id: "reader", label: "Reader mode", hint: "Alt+E", icon: "text", run: function () { Reader.toggle(); } },
      { id: "source", label: "View source", hint: "Alt+U", icon: "code", run: function () { Tools.source(); } },
      { id: "print", label: "Print page", hint: "", icon: "text", run: function () { Tools.print(); } },
      { id: "find", label: "Find in page", hint: "Ctrl+F", icon: "search", run: function () { Finder.open(); } },
      { id: "star", label: "Bookmark this page", hint: "Alt+D", icon: "star", run: function () { UI.star(); } },
      { id: "hist", label: "History", hint: "Ctrl+H", icon: "clock", run: function () { UI.history(); } },
      { id: "marks", label: "Bookmarks", hint: "", icon: "star", run: function () { UI.marks(); } },
      { id: "dl", label: "Downloads", hint: "", icon: "down", run: function () { UI.downloads(); } },
      { id: "rules", label: "Per-site rules", hint: "", icon: "filter", run: function () { UI.rules(); } },
      { id: "storage", label: "Storage", hint: "", icon: "db", run: function () { UI.storage(); } },
      { id: "set", label: "Settings", hint: "Ctrl+,", icon: "gear", run: function () { UI.settings(); } },
      { id: "onboard", label: "Get unblocked", hint: "", icon: "info", run: function () { UI.onboard(); } },
      { id: "diag", label: "Layer matrix", hint: "Alt+Y", icon: "info", run: function () { Diag.matrix(); } },
      { id: "stealth", label: "Stealth report", hint: "", icon: "shield", run: function () { UI.stealthReport(); } },
      { id: "net", label: "Network log", hint: "Alt+N", icon: "gauge", run: function () { UI.net(); } },
      { id: "console", label: "Console", hint: "Alt+J", icon: "terminal", run: function () { UI.console(); } },
      { id: "inspect", label: "Inspect element", hint: "Alt+I", icon: "crosshair", run: function () { Tools.pick(); } },
      { id: "sock", label: "Socket lab", hint: "", icon: "socket", run: function () { Modal.open("mSockets"); } },
      { id: "split", label: "Toggle split view", hint: "Alt+\\", icon: "split", run: function () { UI.split(); } },
      { id: "theme", label: "Toggle theme", hint: "Alt+K", icon: "moon", run: function () { UI.theme(); } },
      { id: "sound", label: "Toggle sound", hint: "", icon: "wave", run: function () { UI.sound(); } },
      { id: "fx", label: "Toggle background", hint: "", icon: "wand", run: function () { FX.toggle(); } },
      { id: "cache", label: "Clear response cache", hint: "", icon: "db", run: function () { Cache.clear(); Toast.ok("Cache cleared"); } },
      { id: "probe", label: "Re-probe every relay", hint: "", icon: "zap", run: function () { Prober.all(); Toast.info("Probing"); } },
      { id: "swboot", label: "Boot Scramjet now", hint: "Alt+Shift+S", icon: "bolt", run: function () { UI.warmScram(); } },
      { id: "swun", label: "Unregister the service worker", hint: "", icon: "trash", run: function () { SJ.unregister().then(function () { Toast.ok("Service worker removed"); }); } }
    ];
    DECOYS.forEach(function (d) {
      c.push({ id: "d-" + d.id, label: "Decoy: " + d.label, hint: "", icon: "eye", group: "Decoys", run: function () { Decoy.show(d.id); } });
    });
    DISGUISES.forEach(function (d) {
      if (d.id === "none") return;
      c.push({ id: "g-" + d.id, label: "Disguise: " + String(d.title || d.id).replace("__SITE__", "site"), hint: "", icon: "shield", group: "Disguises", run: function () { UI.disguise(d.id); } });
    });
    Object.keys(ROUTES).forEach(function (k) {
      c.push({ id: "r-" + k, label: "Route: " + ROUTES[k].label, hint: "", icon: k === "scram" ? "bolt" : "route", group: "Routes", run: function () { UI.route(k); } });
    });
    Object.keys(TRANS).forEach(function (k) {
      c.push({ id: "t-" + k, label: "Transport: " + TRANS[k].label, hint: "", icon: "route", group: "Transport", run: function () { UI.trans(k); } });
    });
    PRESETS.forEach(function (p) {
      c.push({ id: "p" + p.label, label: "Open " + p.label, hint: phost(p.url), icon: "layers", group: "Presets", img: Favicons.live(p.url), run: function () { UI.load(p.url); } });
    });
    return c;
  }
  function build(q) {
    const out = [];
    const all = cmds();
    if (q) {
      all.map(function (c) { return { c: c, s: fuzzy(q, c.label + " " + (c.group || "")) }; })
        .filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; })
        .slice(0, 14).forEach(function (x) { out.push(x.c); });
      if (isUrl(q)) out.unshift({ id: "go", label: "Open " + phost(norm(q)), hint: "url", icon: "globe", group: "Navigate", run: function () { UI.load(norm(q)); } });
      else out.unshift({ id: "s", label: "Search " + cut(q, 40), hint: "web", icon: "search", group: "Navigate", run: function () { UI.search(q); } });
      History.search(q, 6).forEach(function (h) {
        out.push({ id: "h" + h.id, label: h.title, hint: phost(h.url), icon: "clock", group: "History", img: Favicons.live(h.url), run: function () { UI.load(h.url); } });
      });
    } else {
      History.recent(6).forEach(function (h) {
        out.push({ id: "h" + h.id, label: h.title, hint: phost(h.url), icon: "clock", group: "Recent", img: Favicons.live(h.url), run: function () { UI.load(h.url); } });
      });
      all.filter(function (c) { return !c.group; }).forEach(function (c) { out.push(c); });
    }
    return out.slice(0, 44);
  }
  function render(q) {
    items = build(q);
    sel = 0;
    list.innerHTML = "";
    if (!items.length) { list.innerHTML = '<div class="palempty">No matches.</div>'; return; }
    let last = null;
    items.forEach(function (it, i) {
      const g = it.group || "Actions";
      if (g !== last) { last = g; list.appendChild(el("div", "palgrp", g)); }
      const row = el("div", "palit" + (i === sel ? " sel" : ""));
      const ic = el("div", "pi");
      if (it.img) {
        const im = document.createElement("img");
        im.src = it.img;
        im.onerror = function () { im.src = Favicons.get("generic"); };
        ic.appendChild(im);
      } else ic.innerHTML = Icons[it.icon] || Icons.globe;
      row.appendChild(ic);
      const t = el("div", "pt");
      t.innerHTML = esc(it.label) + (it.hint ? "<small>" + esc(it.hint) + "</small>" : "");
      row.appendChild(t);
      on(row, "mouseenter", function () { pick(i); });
      on(row, "click", function () { fire(i); });
      list.appendChild(row);
    });
  }
  function pick(i) {
    sel = clamp(i, 0, items.length - 1);
    qsa(".palit", list).forEach(function (r, n) { r.classList.toggle("sel", n === sel); });
    const c = qsa(".palit", list)[sel];
    if (c && c.scrollIntoView) { try { c.scrollIntoView({ block: "nearest" }); } catch (e) {} }
  }
  function fire(i) {
    const it = items[i];
    if (!it) return;
    closePal();
    tick(function () { it.run(); });
  }
  function openPal() { open = true; host.classList.add("open"); input.value = ""; render(""); input.focus(); }
  function closePal() { open = false; host.classList.remove("open"); }
  function init() {
    host = $("pal"); input = $("palInput"); list = $("palList");
    on(input, "input", function () { render(input.value.trim()); });
    on(input, "keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); pick(sel + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); pick(sel - 1); }
      else if (e.key === "Enter") { e.preventDefault(); fire(sel); }
      else if (e.key === "Escape") { e.preventDefault(); closePal(); }
    });
    on(host, "mousedown", function (e) { if (e.target === host) closePal(); });
  }
  return { init: init, open: openPal, close: closePal, isOpen: function () { return open; } };
})();

const FX = (function () {
  let canvas = null, ctx = null, w = 0, h = 0, dpr = 1, parts = [], run = false, off = false;
  let cursor = null, cx = -999, cy = -999, tx = -999, ty = -999, px = -999, py = -999;
  const ripples = [];
  function resize() {
    if (!canvas) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    w = global.innerWidth; h = global.innerHeight;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }
  function seed() {
    const n = Math.round(clamp((w * h) / 30000, 24, 80));
    parts = [];
    for (let i = 0; i < n; i++) {
      parts.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5 + .35,
        vx: (Math.random() - .5) * .14, vy: (Math.random() - .5) * .14, a: Math.random() * .38 + .1, ph: Math.random() * 6.28 });
    }
  }
  function loop() {
    if (!run || !ctx) return;
    ctx.clearRect(0, 0, w, h);
    const light = document.documentElement.getAttribute("data-theme") === "light";
    const base = light ? "40,60,110" : "150,190,255";
    const speed = Math.hypot(tx - px, ty - py);
    px = tx; py = ty;
    const push = clamp(speed * .004, 0, .6);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.ph += .01;
      p.x += p.vx + Math.sin(p.ph) * .06;
      p.y += p.vy + Math.cos(p.ph * .8) * .06;
      if (push > .02) {
        const dx = p.x - tx, dy = p.y - ty, d = Math.hypot(dx, dy) || 1;
        if (d < 190) { p.x += (dx / d) * push * (1 - d / 190) * 2.4; p.y += (dy / d) * push * (1 - d / 190) * 2.4; }
      }
      if (p.x < -6) p.x = w + 6; if (p.x > w + 6) p.x = -6;
      if (p.y < -6) p.y = h + 6; if (p.y > h + 6) p.y = -6;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fillStyle = "rgba(" + base + "," + p.a + ")"; ctx.fill();
    }
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j += 3) {
        const a = parts[i], b = parts[j];
        const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 13500) {
          ctx.strokeStyle = "rgba(" + base + "," + ((1 - d2 / 13500) * (light ? .1 : .13)) + ")";
          ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (let k = ripples.length - 1; k >= 0; k--) {
      const rp = ripples[k];
      rp.r += 2.6; rp.a -= .012;
      if (rp.a <= 0) { ripples.splice(k, 1); continue; }
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, 6.2832);
      ctx.strokeStyle = "rgba(" + base + "," + rp.a + ")"; ctx.lineWidth = 1.1; ctx.stroke();
    }
    raf(loop);
  }
  function cursorLoop() {
    if (!cursor) return;
    cx += (tx - cx) * .12; cy += (ty - cy) * .12;
    cursor.style.transform = "translate(" + cx + "px," + cy + "px) translate(-50%,-50%)";
    raf(cursorLoop);
  }
  function start() { if (run || off) return; run = true; raf(loop); }
  function stop() { run = false; }
  function toggle() {
    off = !off;
    document.body.classList.toggle("fxoff", off);
    if (off) stop(); else start();
    Store.set("fxOff", off);
    Toast.info(off ? "Background off" : "Background on");
  }
  function init() {
    canvas = $("fx"); cursor = $("cursor");
    if (canvas) { ctx = canvas.getContext("2d"); resize(); on(global, "resize", deb(resize, 200)); }
    off = Store.getSync("fxOff", false);
    if (off) document.body.classList.add("fxoff");
    on(global, "pointermove", thr(function (e) { tx = e.clientX; ty = e.clientY; }, 16));
    on(global, "pointerdown", function (e) { ripples.push({ x: e.clientX, y: e.clientY, r: 2, a: .3 }); if (ripples.length > 8) ripples.shift(); });
    if (!off) { start(); raf(cursorLoop); }
  }
  return { init: init, toggle: toggle, start: start, stop: stop };
})();

const Radar = (function () {
  let cv = null, t = 0, run = false;
  function draw() {
    if (!cv) return;
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = 104, h = 20;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px"; }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const ps = Pool.relays().slice(0, 24);
    if (!ps.length) return;
    const bw = w / ps.length;
    ps.forEach(function (p, i) {
      const sc = Pool.score(p);
      const hh = clamp(sc / 100 * (h - 3), 1, h - 3);
      const hl = Pool.health(p);
      c.fillStyle = hl === "ok" ? "#3ee6a8" : hl === "wn" ? "#ffb545" : "#ff5f7e";
      c.globalAlpha = .32 + (sc / 100) * .55;
      c.fillRect(i * bw + 1, h - hh, Math.max(bw - 2, 1), hh);
    });
    const sx = (Math.sin(t / 22) * .5 + .5) * w;
    const g = c.createLinearGradient(sx - 16, 0, sx + 16, 0);
    g.addColorStop(0, "rgba(79,140,255,0)"); g.addColorStop(.5, "rgba(79,140,255,.35)"); g.addColorStop(1, "rgba(79,140,255,0)");
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(sx - 16, 0, 32, h);
  }
  function loop() { if (!run) return; t++; draw(); raf(loop); }
  function init() { cv = $("radar"); run = true; raf(loop); }
  return { init: init, draw: draw };
})();

const Spark = (function () {
  function draw(cv, values, cls) {
    if (!cv) return;
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = 64, h = 18;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (!values.length) return;
    const max = Math.max.apply(null, values) || 1;
    const step = w / Math.max(values.length - 1, 1);
    const col = cls === "ok" ? "#3ee6a8" : cls === "wn" ? "#ffb545" : "#ff5f7e";
    c.beginPath();
    values.forEach(function (v, i) {
      const x = i * step, y = h - 2 - (v / max) * (h - 4);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.strokeStyle = col; c.lineWidth = 1.4; c.lineJoin = "round"; c.stroke();
    c.lineTo(w, h); c.lineTo(0, h); c.closePath();
    c.fillStyle = col; c.globalAlpha = .16; c.fill();
  }
  return { draw: draw };
})();

/* =============================================================================
   42  diag  ::  layer matrix with one-click fixes
   ============================================================================= */
const Diag = (function () {
  const LAYERS = [
    { id: "shell", label: "Shell origin", note: "must be an unclassified host", fix: "host on pages.dev" },
    { id: "sw", label: "Service worker", note: "needs http(s) and a secure context", fix: "boot scramjet" },
    { id: "worker", label: "Worker fleet", note: "the tunnel and relay host", fix: "deploy a worker" },
    { id: "wisp", label: "Wisp tunnel", note: "websocket to the worker", fix: "ping the fleet" },
    { id: "tls", label: "TLS endpoint", note: "server-side TLS, plain HTTP inside", fix: "check the wss path" },
    { id: "dns", label: "DNS path", note: "must resolve outside the school", fix: "open DoH" },
    { id: "relay", label: "Relay", note: "fallback rungs if wisp dies", fix: "re-probe relays" },
    { id: "frame", label: "Frame", note: "blob or srcdoc means no hostname", fix: "use ghost route" },
    { id: "scramjet", label: "Scramjet", note: "full rewrite under your own origin", fix: "boot scramjet" },
    { id: "stealth", label: "Stealth", note: "no fingerprints in the top document", fix: "turn on scrubbing" }
  ];

  function status(id) {
    switch (id) {
      case "shell": return location.protocol === "file:" ? ["bd", "file://"] : ["ok", location.host];
      case "sw": return SJ.live() ? ["ok", "live"] : (("serviceWorker" in navigator) ? ["wn", "idle"] : ["bd", "unsupported"]);
      case "worker": return Fleet.live().length ? ["ok", Fleet.live().length + " node(s)"] : ["bd", "none"];
      case "wisp": return Wisp.stats().some(function (s) { return s.open; }) ? ["ok", "connected"] : ["wn", "idle"];
      case "tls": return WispHTTP.available() ? ["ok", "available"] : ["bd", "no tls endpoint"];
      case "dns": return DoH.last ? ["ok", DoH.last] : ["wn", "untested"];
      case "relay": {
        const r = Pool.ranked();
        return r.length ? ["ok", r.length + " rungs"] : ["bd", "none"];
      }
      case "frame": return /ghost|stealth|srcdoc|airgap|opaque|scram/.test(UI.S.route) ? ["ok", UI.S.route] : ["wn", UI.S.route];
      case "scramjet": return SJ.live() ? ["ok", "live"] : ["wn", "not booted"];
      case "stealth": {
        const st = Stealth.selfTest();
        return st.hits.length === 0 ? ["ok", "clean"] : ["wn", st.hits.length + " signature(s)"];
      }
      default: return ["wn", "?"];
    }
  }

  function render() {
    const b = $("diagBody");
    if (!b) return;
    b.innerHTML = '<div class="palgrp">layer matrix</div>' +
      LAYERS.map(function (l) {
        const s = status(l.id);
        return '<div class="lay"><div class="ls ' + s[0] + '"></div><div class="ln"><b>' + esc(l.label) +
          '</b><small>' + esc(l.note) + ' &middot; ' + esc(s[1]) + '</small></div>' +
          '<button class="btn gho tiny" data-fix="' + l.id + '">' + esc(l.fix) + '</button></div>';
      }).join("") +
      '<div class="palgrp">environment</div>' +
      '<div class="kv"><span class="k">version</span><span class="v">' + esc(VERSION) + '</span></div>' +
      '<div class="kv"><span class="k">secure context</span><span class="v ' + (global.isSecureContext ? "ok" : "bd") + '">' + (global.isSecureContext ? "yes" : "no") + '</span></div>' +
      '<div class="kv"><span class="k">stealth score</span><span class="v">' + Stealth.score() + " - " + esc(Stealth.label(Stealth.score())) + '</span></div>' +
      '<div class="kv"><span class="k">transport engine</span><span class="v">' + esc(UI.S.transportEngine) + '</span></div>' +
      '<div class="kv"><span class="k">wisp budget</span><span class="v">' + CFG.wispBudget + ' per generation</span></div>' +
      '<div class="palgrp">fallback ' + esc(CFG.swFile) + '</div>' +
      '<div class="wcode">' + esc(SJ.swSource()) + '</div>';

    qsa("[data-fix]", b).forEach(function (btn) {
      on(btn, "click", function () {
        const id = btn.getAttribute("data-fix");
        if (id === "sw" || id === "scramjet") UI.warmScram();
        else if (id === "worker") UI.worker();
        else if (id === "wisp") Fleet.pingAll().then(function (n) { Toast.info(n + " node(s) alive"); render(); });
        else if (id === "tls") UI.fleet();
        else if (id === "dns") DoH.query("example.com").then(function (r) { DoH.last = r.length ? r[0] : ""; render(); });
        else if (id === "relay") Prober.all(function () { render(); });
        else if (id === "frame") UI.route("ghost");
        else if (id === "stealth") UI.settings();
        else if (id === "shell") UI.onboard();
        setTimeout(render, 1200);
      });
    });
  }

  function matrix() { render(); Modal.open("mDiag"); }

  return { render: render, matrix: matrix, LAYERS: LAYERS };
})();

/* =============================================================================
   43  storage / 44 session
   ============================================================================= */
const Storage2 = (function () {
  function usage() {
    return Promise.all([
      navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({}),
      Store.listAll("history").then(function (a) { return a.length; }).catch(function () { return 0; }),
      Store.listAll("bookmarks").then(function (a) { return a.length; }).catch(function () { return 0; }),
      Store.listAll("downloads").then(function (a) { return a.length; }).catch(function () { return 0; })
    ]).then(function (r) {
      return { bytes: (r[0] && r[0].usage) || 0, quota: (r[0] && r[0].quota) || 0, history: r[1], marks: r[2], downloads: r[3] };
    });
  }
  return { usage: usage };
})();

const Session = (function () {
  function save() {
    return Store.set("sessionFull", {
      ts: Date.now(),
      tabs: Tabs.all().map(function (t) { return { url: t.url, title: t.title, side: t.side, route: t.route }; })
    });
  }
  function load() { return Store.get("sessionFull", null); }
  function clear() { return Store.del("sessionFull"); }
  return { save: save, load: load, clear: clear };
})();

/* =============================================================================
   45  ui
   ============================================================================= */
const UI = (function () {
  const S = Object.assign({}, DEFAULTS);
  let lastUrl = "";
  let progTimer = null;

  function status(msg, kind) {
    const s = $("statusMsg");
    if (!s) return;
    s.textContent = msg;
    s.classList.toggle("busy", kind === "busy");
  }
  function badge(route, ms) {
    const r = $("stRouteVal"), w = $("stRoute");
    if (r) r.textContent = route || "-";
    if (w) w.className = "sit" + (route ? " ok" : "");
    lat(ms);
  }
  function lat(ms) {
    const l = $("stLatVal"), w = $("stLat");
    if (l) l.textContent = ms ? ms + "ms" : "-";
    if (w) w.className = "sit" + (ms ? (ms < 1500 ? " ok" : ms < 3200 ? " wn" : " bd") : "");
  }
  function cacheStat() { const c = $("stCacheVal"); if (c) c.textContent = String(Cache.stats().hits); }
  function swStat() {
    const v = $("stSwVal"), w = $("stSw");
    const live = SJ.live();
    if (v) v.textContent = live ? "live" : ("serviceWorker" in navigator ? "idle" : "none");
    if (w) w.className = "sit" + (live ? " ok" : " wn");
  }
  function wispStat() {
    const v = $("stWispVal"), w = $("stWisp");
    const s = Wisp.stats();
    const open = s.filter(function (x) { return x.open; }).length;
    if (v) v.textContent = open ? "up" : (s.length ? "idle" : "none");
    if (w) w.className = "sit" + (open ? " ok" : (s.length ? " wn" : " bd"));
  }
  function fleetStat() {
    const v = $("stFleetVal"), w = $("stFleet");
    const n = Fleet.all().length, live = Fleet.live().length;
    if (v) v.textContent = live + "/" + n;
    if (w) w.className = "sit" + (live ? " ok" : (n ? " bd" : ""));
    const c = $("fleetChip");
    if (c) {
      c.className = "sec " + (live ? "ok" : (n ? "bd" : ""));
      c.textContent = n ? (live + " live") : "no worker";
    }
  }
  function secChip(kind, txt) {
    const c = $("secChip");
    if (!c) return;
    c.className = "sec " + (kind || "");
    c.textContent = txt || "idle";
  }
  function meter() {
    const v = Stealth.score();
    const b = $("meterBar"), t = $("meterVal"), m = $("meter");
    if (b) b.style.width = v + "%";
    if (t) t.textContent = v;
    if (m) { m.className = "meter" + (v >= 62 ? " hi" : (v < 42 ? " lo" : "")); m.title = "Stealth " + v + " - " + Stealth.label(v); }
  }
  function progress(v) {
    const bar = qs("#prog i"), wrap = $("prog");
    if (!bar || !wrap) return;
    wrap.classList.remove("done");
    bar.style.width = clamp(v, 0, 100) + "%";
    if (v >= 100) { clearTimeout(progTimer); progTimer = setTimeout(function () { wrap.classList.add("done"); bar.style.width = "0%"; }, 360); }
  }
  function chain(url) {
    const r = url ? Rules.get(host(url)) : null;
    if (r && r.route && r.route !== "auto") return [r.route];
    if (S.route !== "auto") return [S.route];
    return Stealth.order();
  }

  function load(raw, opts) {
    opts = opts || {};
    const url = norm(raw);
    if (!url) { Toast.warn("Invalid address", String(raw).slice(0, 54)); return; }
    const rule = Intercept.test(url);
    if (rule) {
      if (rule.action === "block") { Toast.warn("Blocked by rule", phost(url)); return; }
      if (rule.action === "redirect" && rule.to) return load(rule.to, opts);
    }

    let rec = Tabs.active();
    if (!rec || opts.newTab) {
      rec = Tabs.create(url, { title: phost(url), icon: Favicons.live(url), side: opts.side || "a" });
      Tabs.activate(rec.id);
    }
    const uEl = $("urlInput");
    if (uEl) { uEl.value = url; syncField(uEl); }
    lastUrl = url;
    Tabs.push(rec, url, phost(url));
    Tabs.meta(rec, phost(url), Favicons.live(url));

    const ch = chain(url);
    const errors = [];
    let i = 0, triedSvg = false, target = url;
    const t0 = nowMs();

    Pane.reset(rec.pane);
    Tabs.setBusy(rec, true);
    secChip("", "connecting");
    status("tunnelling \u00b7 " + (S.route === "auto" ? "auto" : S.route), "busy");
    progress(7);
    meter();

    function next() {
      if (i >= ch.length) {
        const alt = !triedSvg ? swap(target, ".svg", ".html") : "";
        if (alt) { triedSvg = true; i = 0; target = alt; Pane.sub(rec.pane, "retrying as .html"); return tick(next); }
        status("every tunnel failed", "bad");
        badge("failed", 0);
        secChip("bd", "failed");
        progress(100);
        Tabs.setBusy(rec, false);
        if (S.autoHeal && !errors.length) return load(url);
        err(rec, target, errors);
        return;
      }
      const r = ch[i++];
      const def = ROUTES[r];
      if (!def) return next();
      Pane.steps(rec.pane, i);
      Pane.txt(rec.pane, r + " \u00b7 connecting");
      Pane.sub(rec.pane, "hop " + i + " of " + ch.length);
      progress(10 + i * 9);

      run(r, def, target, rec).then(function (info) {
        badge(r, info.ms || 0);
        cacheStat();
        secChip(r === "scram" ? "ok" : "wn", r === "scram" ? "sw" : "relay");
        status(r === "direct" ? "loaded raw" : "tunnelled via " + r, "ok");
        progress(100);
        Pane.okSteps(rec.pane);
        Pane.done(rec.pane);
        rec.route = r;
        Tabs.setBusy(rec, false);
        Tabs.mark(rec, target, r, Math.round(nowMs() - t0));
        History.record(target, rec.title);
        Store.set("lastUrl", target);
        meter();
        if (opts.toast !== false && i > 1) Toast.ok("Loaded via " + r, info.proxy && info.proxy !== "cache" ? "through " + info.proxy : "");
      }).catch(function (e) {
        errors.push(r + " \u2014 " + e.message);
        Log.warn("route fail " + r, e.message);
        next();
      });
    }
    next();
  }

  function run(route, def, url, rec) {
    try { return runInner(route, def, url, rec); }
    catch (e) { return Promise.reject(e); }
  }
  function userJs(hn) { return UserScripts.forHost(hn).map(function (s) { return s.js || ""; }).filter(Boolean).join("\n"); }
  function userCss(hn) { return UserScripts.forHost(hn).map(function (s) { return s.css || ""; }).filter(Boolean).join("\n"); }

  function runInner(route, def, url, rec) {
    const base = dir(url);
    const t0 = nowMs();
    const hn = host(url);

    if (def.tr === "scram") {
      return SJ.boot().then(function () {
        Pane.txt(rec.pane, "scramjet \u00b7 mounting frame");
        return SJ.mount(rec.pane, url);
      }).then(function (f) {
        rec.frame = f;
        return { proxy: "scramjet", ms: Math.round(nowMs() - t0) };
      });
    }
    if (def.tr === "direct") {
      const f = Renderer.mount(rec.pane, { tr: "src", src: url });
      rec.frame = f;
      return Renderer.wait(f, 5200).then(function () { return { ms: Math.round(nowMs() - t0) }; });
    }
    if (def.tr === "src") {
      const n = Fleet.best();
      const src = n ? Fleet.relayFor(n, url) : (function () {
        const p = Pool.ranked({ boring: S.boringBias })[0];
        return p ? Pool.build(p, url) : url;
      })();
      const f = Renderer.mount(rec.pane, { tr: "src", src: src });
      rec.frame = f;
      return Renderer.wait(f, 5200).then(function () { return { proxy: n ? "worker" : "relay", ms: Math.round(nowMs() - t0) }; });
    }

    return Fetcher.best(url, { timeout: CFG.t.fetch, boring: S.boringBias, mode: "doc" }).then(function (r) {
      const proxy = r.proxy;
      Rewriter.setWrap(function (u) {
        let out;
        if (proxy.tpl) out = Pool.build(proxy, u);
        else {
          const n = Fleet.best();
          out = n ? Fleet.relayFor(n, u) : u;
        }
        if (S.cacheBust) out += (out.indexOf("?") === -1 ? "?" : "&") + "_v=" + Date.now().toString(36);
        return out;
      });
      Pane.txt(rec.pane, route + " \u00b7 rewriting");

      const zoom = (Rules.get(hn) && Rules.get(hn).zoom) || S.zoom;
      const bopts = { zoom: zoom, userJs: userJs(hn), extraCss: userCss(hn) };

      if (def.rw === "inline" || S.subInline) {
        return Rewriter.inlineAll(r.text, base, { boring: S.boringBias }).then(function (res) {
          const html = Rewriter.build(res.html, base, "deep", bopts);
          const f = Renderer.mount(rec.pane, { tr: def.tr, html: html });
          rec.frame = f;
          return Renderer.wait(f, 6400).then(function () { return { proxy: proxy.label, ms: r.ms }; });
        });
      }
      const html = Rewriter.build(r.text, base, def.rw, bopts);
      const f = Renderer.mount(rec.pane, { tr: def.tr, html: html });
      rec.frame = f;
      return Renderer.wait(f, 5600).then(function () { return { proxy: proxy.label, ms: r.ms }; });
    });
  }

  function err(rec, url, errors) {
    const n = Fleet.best();
    const proxied = n ? Fleet.relayFor(n, url) : url;
    const panel = el("div", "errp");
    panel.innerHTML =
      '<h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg> Every tunnel failed</h2>' +
      '<div class="lead">Nothing came back on any route. Check the layer matrix - it names the exact break.</div>' +
      '<div class="tgt">' + esc(url) + '</div><h3>Attempts</h3><ul class="errl">' +
      errors.map(function (e) {
        const p = String(e).split(" \u2014 ");
        return '<li><span class="tg">' + esc(p[0]) + '</span><span class="ms">' + esc(p.slice(1).join(" \u2014 ")) + '</span></li>';
      }).join("") + '</ul><h3>Try this</h3><ul class="tips">' +
      '<li>Open the <b>layer matrix</b> (Alt+Y) - it says which layer is down.</li>' +
      '<li>No worker? Deploy one. It is the whole bypass.</li>' +
      '<li>Transport to <b>Wisp tunnel only</b>.</li>' +
      '<li>Route to <b>Airgap</b> - it inlines everything so the frame contacts nobody.</li>' +
      '<li>Ping the <b>fleet</b> (Alt+M) and remove dead nodes.</li>' +
      '<li>Some sites refuse frames - hit <b>Pop</b>.</li></ul>' +
      '<div class="erract"><button class="btn pri" data-a="retry">Retry</button>' +
      '<button class="btn gho" data-a="route">Next route</button>' +
      '<button class="btn gho" data-a="airgap">Try airgap</button>' +
      '<button class="btn gho" data-a="matrix">Layer matrix</button>' +
      '<button class="btn gho" data-a="pop">Pop out</button></div>';
    rec.pane.innerHTML = "";
    rec.pane.appendChild(panel);
    rec.frame = null;
    qsa("[data-a]", panel).forEach(function (b) {
      on(b, "click", function () {
        const a = b.getAttribute("data-a");
        if (a === "retry") load(url);
        else if (a === "route") cycleRoute(true);
        else if (a === "airgap") route("airgap");
        else if (a === "matrix") Diag.matrix();
        else if (a === "pop") pop(proxied);
      });
    });
  }

  function copy(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { Toast.ok("Copied"); }, function () { Toast.warn("Copy failed"); });
    } else Toast.warn("Copy unavailable");
  }
  function pop(url) {
    const n = Fleet.best();
    const target = n ? Fleet.relayFor(n, url) : url;
    try {
      const w = global.open(target, "_blank", "noopener");
      if (w) w.focus();
      Toast.info("Opened outside the frame");
    } catch (e) { Toast.warn("Popup blocked"); }
  }

  function search(q) {
    q = String(q || "").trim();
    if (!q) return;
    if (isUrl(q) && !/\s/.test(q)) return load(q);
    load((ENGINES[S.engine] || ENGINES.ddg).tpl(q));
  }
  function submit() {
    const i = $("qInput");
    if (!i) return;
    const v = i.value.trim();
    if (!v) { i.focus(); return; }
    search(v);
  }
  function cycleRoute(silent) {
    const idx = ROUTE_ORDER.indexOf(S.route);
    S.route = ROUTE_ORDER[(idx + 1) % ROUTE_ORDER.length];
    const sel = $("routeSel"); if (sel) sel.value = S.route;
    Store.set("route", S.route);
    if (!silent) Toast.info("Route: " + (ROUTES[S.route] ? ROUTES[S.route].label : S.route));
    if (lastUrl && !silent) load(lastUrl);
    meter();
  }
  function route(r) {
    if (r !== "auto" && !ROUTES[r]) return;
    S.route = r;
    const sel = $("routeSel"); if (sel) sel.value = r;
    Store.set("route", r);
    if (lastUrl) load(lastUrl);
    meter();
  }
  function trans(t) {
    if (!TRANS[t]) return;
    S.trans = t;
    const sel = $("transSel"); if (sel) sel.value = t;
    Store.set("trans", t);
    if (lastUrl) load(lastUrl);
    meter();
  }
  function disguise(id) {
    S.disguise = id;
    const sel = $("disguiseSel"); if (sel) sel.value = id;
    Cloaker.apply(id);
    Store.set("disguise", id);
  }
  function theme() {
    S.theme = S.theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", S.theme);
    Store.set("theme", S.theme);
  }
  function sound() {
    const v = Sound.toggle();
    S.sound = v;
    Store.set("sound", v);
    Toast.info(v ? "Sound on" : "Sound off");
  }
  function full() {
    document.body.classList.toggle("full");
    const b = $("btnFull");
    if (b) b.classList.toggle("on", document.body.classList.contains("full"));
  }

  /* fixed: cycles none -> 2 -> 4 -> none, and hides the right panes each time */
  function split() {
    const order = ["none", "split2", "split4"];
    const cur = document.body.classList.contains("split4") ? "split4"
      : (document.body.classList.contains("split2") ? "split2" : "none");
    const next = order[(order.indexOf(cur) + 1) % order.length];
    document.body.classList.remove("split2", "split4");
    if (next !== "none") document.body.classList.add(next);
    S.split = next;
    Store.set("split", next);
    $("btnSplit").classList.toggle("on", next !== "none");
    const need = next === "split4" ? 3 : (next === "split2" ? 1 : 0);
    ["b", "c", "d"].forEach(function (side, i) {
      $("vpane" + side.toUpperCase()).classList.toggle("hidden", i >= need);
    });
    $("view").style.gridTemplateColumns = "";
    $("view").style.gridTemplateRows = "";
    if (next !== "none" && !Tabs.all().some(function (t) { return t.side === "b"; })) {
      const r = Tabs.create(CFG.home, { title: "Side", side: "b" });
      Tabs.activate(r.id);
      load(CFG.home, { newTab: true, side: "b", toast: false });
    }
  }

  function star() {
    const rec = Tabs.active();
    const u = lastUrl || (rec && rec.url);
    if (!u) return;
    Marks.toggle(u, rec ? rec.title : phost(u)).then(function (added) {
      Toast.ok(added ? "Bookmarked" : "Removed", phost(u));
      const b = $("btnStar");
      if (b) b.classList.toggle("on", added);
      Bus.emit("marks:changed");
    });
  }
  function saveCopy() {
    const html = "<!doctype html>\n" + document.documentElement.outerHTML;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = "classes.html";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 250);
    Toast.ok("Saved a local copy", "file:// cannot be filtered");
  }
  function hardToggle() {
    S.hard = !S.hard;
    document.body.classList.toggle("hard", S.hard);
    Store.set("hard", S.hard);
    if (S.hard) {
      S.trans = "auto"; S.route = "auto"; S.boringBias = true;
      const ts = $("transSel"); if (ts) ts.value = "auto";
      const rs = $("routeSel"); if (rs) rs.value = "auto";
      Toast.ok("Hardened", "scramjet first, ghost frames, deep rewrite");
      if (lastUrl) load(lastUrl);
    } else Toast.info("Hardened off");
    meter();
  }
  function paranoidToggle() {
    S.paranoid = !S.paranoid;
    Store.set("paranoid", S.paranoid);
    if (S.paranoid) {
      S.hard = true;
      document.body.classList.add("hard");
      S.trans = "wisp"; S.opaque = true;
      Renderer.setOpaque(true);
      const ts = $("transSel"); if (ts) ts.value = "wisp";
      Toast.ok("Paranoid", "airgap first, wisp only, opaque frames");
      if (lastUrl) load(lastUrl);
    } else Toast.info("Paranoid off");
    meter();
  }
  function warmScram() {
    Toast.info("Booting Scramjet", "rewriter + service worker");
    SJ.boot().then(function () { Toast.ok("Scramjet ready"); swStat(); meter(); })
      .catch(function (e) { Toast.bad("Scramjet failed", e.message); });
  }

  function history() { renderHistory(); Modal.open("mHistory"); }
  function renderHistory() {
    const b = $("historyBody");
    if (!b) return;
    const all = History.all();
    if (!all.length) { b.innerHTML = '<div class="palempty">Nothing yet.</div>'; return; }
    b.innerHTML = "";
    all.slice(0, 240).forEach(function (h) {
      const row = el("div", "hit");
      const ic = el("div", "hi");
      const im = document.createElement("img");
      im.src = Favicons.live(h.url, 32);
      im.onerror = function () { im.src = Favicons.get("generic"); };
      ic.appendChild(im);
      const t = el("div", "ht");
      t.innerHTML = '<div class="h1">' + esc(h.title) + '</div><div class="h2">' + esc(h.url) + '</div>';
      row.appendChild(ic); row.appendChild(t); row.appendChild(el("div", "hw", ago(h.ts)));
      on(row, "click", function () { Modal.close("mHistory"); load(h.url); });
      b.appendChild(row);
    });
  }
  function marks() {
    const b = $("marksBody");
    if (!b) return;
    const all = Marks.list();
    b.innerHTML = "";
    if (!all.length) b.innerHTML = '<div class="palempty">No bookmarks. Alt+D adds one.</div>';
    all.forEach(function (m) {
      const row = el("div", "hit");
      const ic = el("div", "hi");
      const im = document.createElement("img");
      im.src = Favicons.live(m.url, 32);
      im.onerror = function () { im.src = Favicons.get("generic"); };
      ic.appendChild(im);
      const t = el("div", "ht");
      t.innerHTML = '<div class="h1">' + esc(m.title) + '</div><div class="h2">' + esc(m.url) + '</div>';
      const x = el("div", "hx");
      x.innerHTML = Icons.trash;
      on(x, "click", function (e) {
        e.stopPropagation();
        Marks.toggle(m.url).then(function () { marks(); });
      });
      row.appendChild(ic); row.appendChild(t); row.appendChild(x);
      on(row, "click", function () { Modal.close("mMarks"); load(m.url); });
      b.appendChild(row);
    });
    Modal.open("mMarks");
  }
  function downloads() { renderDownloads(); Modal.open("mDownloads"); }
  function renderDownloads() {
    const b = $("downloadsBody");
    if (!b) return;
    b.innerHTML = "";
    const all = Downloads.all();
    if (!all.length) { b.innerHTML = '<div class="palempty">Nothing yet.</div>'; return; }
    all.forEach(function (d) {
      const row = el("div", "hit");
      const ic = el("div", "hi");
      ic.innerHTML = Icons.down;
      const t = el("div", "ht");
      t.innerHTML = '<div class="h1">' + esc(d.name) + '</div><div class="h2">' + esc(cut(d.url, 70)) + '</div>';
      row.appendChild(ic); row.appendChild(t); row.appendChild(el("div", "hw", ago(d.ts)));
      on(row, "click", function () { global.open(d.url, "_blank", "noopener"); });
      b.appendChild(row);
    });
  }
  function rules() { renderRules(); Modal.open("mRules"); }
  function renderRules() {
    const b = $("rulesBody");
    if (!b) return;
    b.innerHTML = "";
    const m = Rules.all();
    const keys = Object.keys(m);
    if (!keys.length) b.innerHTML = '<div class="palempty">No rules. Open a site and press "Add current site".</div>';
    keys.forEach(function (h) {
      const r = m[h];
      const row = el("div", "srow");
      const t = el("div", "stxt");
      t.innerHTML = '<div class="t">' + esc(h) + '</div><div class="d">route ' + esc(r.route || "auto") +
        ' &middot; zoom ' + (r.zoom || 1) + '</div>';
      const x = el("button", "btn dg tiny", "Remove");
      on(x, "click", function () { Rules.set(h, null).then(renderRules); });
      row.appendChild(t); row.appendChild(x);
      b.appendChild(row);
    });
  }
  function storage() {
    Storage2.usage().then(function (u) {
      const b = $("storageBody");
      if (!b) return;
      b.innerHTML =
        '<div class="kv"><span class="k">used</span><span class="v">' + (u.bytes / 1048576).toFixed(2) + ' MB</span></div>' +
        '<div class="kv"><span class="k">quota</span><span class="v">' + (u.quota / 1048576).toFixed(0) + ' MB</span></div>' +
        '<div class="kv"><span class="k">history rows</span><span class="v">' + u.history + '</span></div>' +
        '<div class="kv"><span class="k">bookmarks</span><span class="v">' + u.marks + '</span></div>' +
        '<div class="kv"><span class="k">downloads logged</span><span class="v">' + u.downloads + '</span></div>' +
        '<div class="palgrp">clear</div>' +
        '<div class="srow"><div class="stxt"><div class="t">History</div></div><button class="btn dg tiny" id="stClrHist">Clear</button></div>' +
        '<div class="srow"><div class="stxt"><div class="t">Downloads log</div></div><button class="btn dg tiny" id="stClrDl">Clear</button></div>' +
        '<div class="srow"><div class="stxt"><div class="t">Session snapshot</div></div><button class="btn dg tiny" id="stClrSes">Clear</button></div>';
      on($("stClrHist"), "click", function () { History.clear().then(storage); });
      on($("stClrDl"), "click", function () { Downloads.clear().then(storage); });
      on($("stClrSes"), "click", function () { Session.clear().then(function () { Toast.ok("Session cleared"); }); });
    });
    Modal.open("mStorage");
  }

  function settings() { renderSettings(); Modal.open("mSettings"); }
  function worker() { $("workerCode").textContent = WorkerGen.code(); Modal.open("mWorker"); }
  function proxies() { renderProxies(); Modal.open("mProxies"); }
  function net() { NetLog.render(); Modal.open("mNet"); }
  function console_() { Tools.renderConsole(); Modal.open("mConsole"); }
  function help() { renderHelp(); Modal.open("mHelp"); }
  function decoyPicker() { renderDecoyPicker(); Modal.open("mDecoy"); }
  function onboard() { renderOnboard(); Modal.open("mOnboard"); }

  function fleet() {
    const b = $("fleetBody");
    if (!b) return;
    b.innerHTML = "";
    const nodes = Fleet.all();
    if (!nodes.length) b.innerHTML = '<div class="palempty">No workers yet. Generate one and paste the host in.</div>';
    nodes.forEach(function (n) {
      const row = el("div", "prow");
      const d = el("div", "ps " + (n.parked ? "wn" : "ok"));
      const nm = el("div", "pn");
      nm.innerHTML = esc(n.base) + "<small>ok " + n.h.ok + " / fail " + n.h.fail + " &middot; gen " + n.generation + "</small>";
      const l = el("div", "pl", n.h.lat ? Math.round(n.h.lat) + "ms" : "\u2014");
      const bud = el("div", "pbud", n.budget + "/" + CFG.wispBudget);
      const x = el("button", "btn dg tiny", "Drop");
      on(x, "click", function () {
        const t = nodes.filter(function (o) { return o !== n; }).map(function (o) { return o.base; }).join("\n");
        const inp = $("workerInput");
        if (inp) inp.value = t;
        Fleet.parse(t);
        fleetStat();
        fleet();
      });
      row.appendChild(d); row.appendChild(nm); row.appendChild(l); row.appendChild(bud); row.appendChild(x);
      b.appendChild(row);
    });
    Modal.open("mFleet");
  }

  function stealthReport() {
    const st = Stealth.selfTest();
    const v = Stealth.score();
    Modal.open("mDiag");
    const b = $("diagBody");
    if (!b) return;
    b.innerHTML =
      '<div class="insbox"><div class="tag">stealth ' + v + ' / 100 &mdash; ' + esc(Stealth.label(v)) + '</div>' +
      '<div class="att">' + (v >= 82 ? "Invisible to categorisation." : v >= 62 ? "Strong. No hostname, opaque traffic." :
        v >= 42 ? "Workable but fingerprintable." : "Thin. Deploy a worker and harden.") + '</div></div>' +
      '<div class="palgrp">signatures in this document</div>' +
      (st.hits.length ? '<div class="wcode">' + esc(st.hits.join("\n")) + '</div>' : '<div class="palempty">clean</div>') +
      '<div class="palgrp">builtin fingerprint</div>' +
      st.natives.map(function (n) {
        return '<div class="kv"><span class="k">' + esc(n.k) + '</span><span class="v ' + (n.native ? "ok" : "bd") + '">' +
          (n.native ? "native" : "patched") + '</span></div>';
      }).join("") +
      '<div class="palgrp">layer value</div>' +
      '<div class="kv"><span class="k">blob / srcdoc frame</span><span class="v">no hostname at all</span></div>' +
      '<div class="kv"><span class="k">wisp over wss</span><span class="v">opaque, no school DNS</span></div>' +
      '<div class="kv"><span class="k">worker relay</span><span class="v">DNS in Cloudflare</span></div>' +
      '<div class="kv"><span class="k">scrubbed globals</span><span class="v">beats Live Intelligence</span></div>';
  }

  function renderOnboard() {
    const b = $("onboardBody");
    if (!b) return;
    const steps = [
      { t: "1. Host the folder", d: "Cloudflare Pages, drag and drop. You get a <code>*.pages.dev</code> host with no category.", done: location.protocol !== "file:" },
      { t: "2. Deploy the worker", d: "Open <b>Worker</b>, copy, paste at dash.cloudflare.com, Deploy.", done: Fleet.all().length > 0 },
      { t: "3. Paste the worker host", d: "Put <code>https://you.workers.dev</code> in the worker box. The chip must read live.", done: Fleet.live().length > 0 },
      { t: "4. Ping the fleet", d: "Alt+M, Ping all. Green means the tunnel answers.", done: Fleet.live().length > 0 },
      { t: "5. Turn on hardened mode", d: "Shield icon or Alt+L.", done: S.hard },
      { t: "6. Run the layer matrix", d: "Alt+Y. Every row should be green. It names the exact break otherwise.", done: Stealth.score() >= 80 },
      { t: "7. Cover yourself", d: "Set a disguise, and Alt+X flips to a fake school screen instantly.", done: S.disguise !== "none" }
    ];
    b.innerHTML = steps.map(function (s) {
      return '<div class="obstep"><div class="obn' + (s.done ? " done" : "") + '">' + (s.done ? "\u2713" : "\u2022") + '</div>' +
        '<div class="obt"><div class="t">' + esc(s.t) + '</div><div class="d">' + s.d + '</div></div></div>';
    }).join("") +
    '<div class="palgrp">why this holds</div>' +
    '<div class="kv"><span class="k">DNS filtering</span><span class="v">never consulted, server-side lookup</span></div>' +
    '<div class="kv"><span class="k">hostname categorisation</span><span class="v">frame has no hostname</span></div>' +
    '<div class="kv"><span class="k">TLS inspection</span><span class="v">TLS terminated in the worker</span></div>' +
    '<div class="kv"><span class="k">Live Intelligence</span><span class="v">globals gone, builtins native</span></div>';
  }

  function renderProxies() {
    const b = $("proxiesBody");
    if (!b) return;
    b.innerHTML = "";
    const head = el("div", "srow");
    head.innerHTML = '<div class="stxt"><div class="t">Scramjet engine</div><div class="d">' +
      (SJ.live() ? "running, prefix " + esc(SJ.prefix) : "not booted") + '</div></div>';
    const hb = el("button", "btn gho tiny", SJ.live() ? "Reboot" : "Boot");
    on(hb, "click", warmScram);
    head.appendChild(hb);
    b.appendChild(head);

    b.appendChild(el("div", "palgrp", "relay pool"));
    Pool.relays().forEach(function (p) {
      const row = el("div", "prow");
      const d = el("div", "ps " + Pool.health(p));
      const n = el("div", "pn");
      n.innerHTML = esc(p.label) + "<small>" + esc(p.tpl) + "</small>";
      const l = el("div", "pl", p.h.lat ? Math.round(p.h.lat) + "ms" : "\u2014");
      const bar = el("div", "pb");
      const f = el("i");
      const sc = Pool.score(p);
      f.style.width = sc + "%";
      if (sc < 34) f.className = "bd"; else if (sc < 62) f.className = "wn";
      bar.appendChild(f);
      const sp = el("canvas", "psp");
      row.appendChild(d); row.appendChild(n); row.appendChild(l); row.appendChild(bar); row.appendChild(sp);
      b.appendChild(row);
      Spark.draw(sp, p.hist, Pool.health(p));
    });
  }

  function renderHelp() {
    const g = $("helpGrid");
    if (!g) return;
    const rows = [
      ["Command palette", "Ctrl K"], ["Find in page", "Ctrl F"], ["Reload", "Alt R"],
      ["New tab", "Alt T"], ["Close tab", "Alt W"], ["Maximise", "Alt F"], ["Decoy screen", "Alt X"],
      ["Reader mode", "Alt E"], ["View source", "Alt U"], ["Console", "Alt J"], ["Inspect", "Alt I"],
      ["Bookmark", "Alt D"], ["Network log", "Alt N"], ["Next route", "Alt G"],
      ["Hardened mode", "Alt L"], ["Paranoid mode", "Alt Shift L"], ["Theme", "Alt K"],
      ["Worker fleet", "Alt M"], ["Split view", "Alt \\"], ["Back", "Alt \u2190"], ["Forward", "Alt \u2192"],
      ["Home", "Alt Home"], ["Save a copy", "Alt S"], ["Settings", "Ctrl ,"], ["History", "Ctrl H"],
      ["Decoy: classroom", "Alt 1"], ["Decoy: docs", "Alt 2"], ["Decoy: drive", "Alt 3"],
      ["Layer matrix", "Alt Y"], ["Boot scramjet", "Alt Shift S"], ["Close overlay", "Esc"]
    ];
    g.innerHTML = rows.map(function (r) {
      return '<div class="krow"><span>' + esc(r[0]) + '</span><kbd>' + esc(r[1]) + '</kbd></div>';
    }).join("");
  }

  function renderDecoyPicker() {
    const b = $("decoyBody");
    if (!b) return;
    b.innerHTML = "";
    DECOYS.forEach(function (d) {
      const row = el("div", "hit");
      const ic = el("div", "hi");
      const im = document.createElement("img");
      im.src = Favicons.get(d.icon);
      ic.appendChild(im);
      const t = el("div", "ht");
      t.innerHTML = '<div class="h1">' + esc(d.label) + '</div>';
      row.appendChild(ic); row.appendChild(t);
      on(row, "click", function () { S.decoy = d.id; Store.set("decoy", d.id); Decoy.show(d.id); Modal.close("mDecoy"); });
      b.appendChild(row);
    });
  }

  function renderSettings() {
    const b = $("settingsBody");
    if (!b) return;
    b.innerHTML = "";
    function group(t) { b.appendChild(el("div", "palgrp", t)); }
    function row(t, d, ctl) {
      const r = el("div", "srow");
      const t2 = el("div", "stxt");
      t2.innerHTML = '<div class="t">' + esc(t) + '</div><div class="d">' + esc(d) + '</div>';
      const c = el("div", "sctl");
      c.appendChild(ctl);
      r.appendChild(t2); r.appendChild(c);
      b.appendChild(r);
    }
    function tgl(get, set) {
      const t = el("div", "tgl" + (get() ? " on" : ""));
      on(t, "click", function () { const v = !t.classList.contains("on"); t.classList.toggle("on", v); set(v); meter(); });
      return t;
    }
    function sel(opts, val, cb) {
      const s = document.createElement("select");
      opts.forEach(function (o) { const x = document.createElement("option"); x.value = o[0]; x.textContent = o[1]; s.appendChild(x); });
      s.value = val;
      s.style.cssText = "height:32px;padding:0 10px;border-radius:8px;background:var(--bg2);border:1px solid var(--ln0);color:var(--fg1);font-size:12px;outline:none";
      on(s, "change", function () { cb(s.value); });
      return s;
    }
    function txt(val, cb, ph) {
      const i = document.createElement("input");
      i.value = val; i.placeholder = ph || "";
      i.style.cssText = "width:250px;height:32px;padding:0 10px;border-radius:8px;background:var(--bg2);border:1px solid var(--ln0);color:var(--fg1);font-size:11.5px;font-family:var(--f-mono);outline:none";
      on(i, "change", function () { cb(i.value.trim()); });
      return i;
    }

    group("Fleet");
    row("Worker hosts", "One per line. They are pinged and ranked; dead ones are dropped.",
      txt(Fleet.all().map(function (n) { return n.base; }).join("\n"), function (v) {
        Store.set("workerText", v);
        Fleet.parse(v);
        fleetStat();
        meter();
      }, "https://you.workers.dev"));
    row("Ping the fleet now", "Verifies every node answers /__ping.", (function () {
      const btn = el("button", "btn gho tiny", "Ping");
      on(btn, "click", function () { Fleet.pingAll().then(function (n) { Toast.info(n + " alive"); fleetStat(); }); });
      return btn;
    })());
    row("Wisp budget per socket", "Free-plan Workers allow 50 subrequests. Lower is safer.",
      sel([["20","20"],["28","28"],["34","34"],["44","44"],["80","80 (paid)"]], String(CFG.wispBudget),
        function (v) { CFG.wispBudget = parseInt(v, 10); Store.set("wispBudget", CFG.wispBudget); }));
    row("Rotate sockets", "Reopen the tunnel before the budget runs out.",
      tgl(function () { return S.wispRotate; }, function (v) { S.wispRotate = v; Store.set("wispRotate", v); }));
    row("Race streams", "Open on two nodes, keep whichever answers first.",
      tgl(function () { return S.raceStreams; }, function (v) { S.raceStreams = v; Store.set("raceStreams", v); }));
    row("Transport engine", "Native removes the CDN dependency entirely.",
      sel([["libcurl","libcurl (CDN)"],["native","native (no CDN)"]], S.transportEngine,
        function (v) { S.transportEngine = v; Store.set("transportEngine", v); }));

    group("Engine");
    row("Render route", "Airgap inlines everything so the frame contacts nobody.",
      sel(ROUTE_ORDER.map(function (r) { return [r, r === "auto" ? "Auto" : ROUTES[r].label]; }), S.route,
        function (v) { route(v); }));
    row("Transport", "Which pipe carries bytes.",
      sel(TRANS_ORDER.map(function (t) { return [t, TRANS[t].label]; }), S.trans, function (v) { trans(v); }));
    row("Inline all assets", "Slow but bulletproof.", tgl(function () { return S.subInline; }, function (v) { S.subInline = v; Store.set("subInline", v); }));
    row("Prefer boring relays", "Rank infrastructure domains higher.", tgl(function () { return S.boringBias; }, function (v) { S.boringBias = v; Store.set("boringBias", v); }));
    row("Cache bust", "Stop stale block verdicts sticking.", tgl(function () { return S.cacheBust; }, function (v) { S.cacheBust = v; Store.set("cacheBust", v); }));
    row("Auto-heal", "Silently downgrade instead of showing the error page.", tgl(function () { return S.autoHeal; }, function (v) { S.autoHeal = v; Store.set("autoHeal", v); }));

    group("Evasion");
    row("Scrub library globals", "Delete $scramjet after boot.", tgl(function () { return S.stealthScrub; }, function (v) { S.stealthScrub = v; Store.set("stealthScrub", v); }));
    row("Keep builtins native", "Forge [native code] on patches.", tgl(function () { return S.nativeify; }, function (v) { S.nativeify = v; Store.set("nativeify", v); }));
    row("Opaque frames", "Drop allow-same-origin.", tgl(function () { return S.opaque; }, function (v) { S.opaque = v; Renderer.setOpaque(v); Store.set("opaque", v); }));
    row("Credentialless frames", "No credentials into frames.", tgl(function () { return S.credless; }, function (v) { S.credless = v; Store.set("credless", v); }));

    group("Stealth");
    row("Disguise", "What the tab looks like.",
      sel(DISGUISES.map(function (d) { return [d.id, d.id === "none" ? "No disguise" : (d.title === "__SITE__" ? "Site favicon" : d.title)]; }), S.disguise,
        function (v) { disguise(v); }));
    row("Panic decoy", "Alt+X flips to this instantly.",
      sel(DECOYS.map(function (d) { return [d.id, d.label]; }), S.decoy, function (v) { S.decoy = v; Store.set("decoy", v); }));
    row("Auto decoy on blur", "Flip when the window loses focus.", tgl(function () { return S.autoDecoy; }, function (v) { S.autoDecoy = v; Store.set("autoDecoy", v); }));
    row("Title sync", "Page title into the tab strip.", tgl(function () { return S.titleSync; }, function (v) { S.titleSync = v; Store.set("titleSync", v); }));

    group("Comfort");
    row("Sound", "Synthesised blips.", tgl(function () { return Sound.enabled(); }, function () { sound(); }));
    row("Wide layout", "Full width shell.", tgl(function () { return S.wide; }, function (v) { S.wide = v; document.body.classList.toggle("wide", v); Store.set("wide", v); }));
    row("Background", "Particles and aurora.", tgl(function () { return !S.fxOff; }, function (v) {
      S.fxOff = !v; document.body.classList.toggle("fxoff", !v);
      if (!v) FX.stop(); else FX.start();
      Store.set("fxOff", !v);
    }));
    row("Theme", "Colour scheme.", sel([["dark","Dark"],["light","Light"]], S.theme, function (v) {
      S.theme = v; document.documentElement.setAttribute("data-theme", v); Store.set("theme", v);
    }));
    row("Page zoom", "Scales the document.", sel([["0.8","80%"],["0.9","90%"],["1","100%"],["1.1","110%"],["1.25","125%"]], String(S.zoom),
      function (v) { S.zoom = parseFloat(v); Store.set("zoom", S.zoom); if (lastUrl) load(lastUrl); }));

    group("Data");
    const clr = el("button", "btn gho tiny", "Clear");
    on(clr, "click", function () { Cache.clear(); Toast.ok("Cache cleared"); });
    row("Response cache", "Five minute document cache.", clr);
    row("Restore tabs on boot", "Bring back last session.", tgl(function () { return S.autoRestore; }, function (v) { S.autoRestore = v; Store.set("autoRestore", v); }));
    const stBtn = el("button", "btn gho tiny", "Open");
    on(stBtn, "click", storage);
    row("Storage", "Quota and per-category clear.", stBtn);

    group("About");
    const kv = el("div");
    kv.innerHTML =
      '<div class="kv"><span class="k">version</span><span class="v">' + esc(VERSION) + '</span></div>' +
      '<div class="kv"><span class="k">fleet</span><span class="v">' + Fleet.live().length + '/' + Fleet.all().length + '</span></div>' +
      '<div class="kv"><span class="k">relays</span><span class="v">' + Pool.relays().length + '</span></div>' +
      '<div class="kv"><span class="k">storage</span><span class="v ' + (Store.ready() ? "ok" : "wn") + '">' + (Store.ready() ? "indexeddb" : "memory") + '</span></div>' +
      '<div class="kv"><span class="k">stealth</span><span class="v">' + Stealth.score() + " - " + esc(Stealth.label(Stealth.score())) + '</span></div>' +
      '<div class="kv"><span class="k">sw file</span><span class="v">' + esc(CFG.swFile) + '</span></div>' +
      '<div class="kv"><span class="k">prefix</span><span class="v">' + esc(SJ.prefix) + '</span></div>';
    b.appendChild(kv);
  }

  function syncField(inp) { const f = inp.closest(".fld"); if (f) f.classList.toggle("has", !!inp.value); }
  function initFields() {
    qsa(".fld input").forEach(function (i) { on(i, "input", function () { syncField(i); }); syncField(i); });
    qsa("[data-clear]").forEach(function (btn) {
      on(btn, "click", function () { const i = $(btn.getAttribute("data-clear")); if (i) { i.value = ""; syncField(i); i.focus(); } });
    });
  }

  function exportAll() {
    const data = {
      v: VERSION, settings: S,
      workers: $("workerInput") ? $("workerInput").value : "",
      relays: $("proxyInput") ? $("proxyInput").value : "",
      marks: Marks.list(), scripts: UserScripts.raw(), rules: Rules.all(), intercept: Intercept.all()
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "classes-settings.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 220);
    Toast.ok("Exported");
  }
  function importAll() { const i = $("fileImport"); if (i) i.click(); }
  function doImport(file) {
    const fr = new FileReader();
    fr.onload = function () {
      try {
        const d = JSON.parse(fr.result);
        if (d.settings) Object.keys(d.settings).forEach(function (k) { if (k in S) S[k] = d.settings[k]; });
        if (d.workers) { const p = $("workerInput"); if (p) { p.value = d.workers; Fleet.parse(d.workers); } }
        if (d.relays) { const p = $("proxyInput"); if (p) { p.value = d.relays; Pool.setCustoms(d.relays); } }
        if (Array.isArray(d.scripts)) UserScripts.save(d.scripts);
        if (d.rules) Store.set("rules", d.rules);
        if (Array.isArray(d.intercept)) Intercept.save(d.intercept);
        applyState();
        Toast.ok("Imported");
      } catch (e) { Toast.bad("Import failed", e.message); }
    };
    fr.readAsText(file);
  }
  function resetAll() {
    Object.keys(DEFAULTS).forEach(function (k) { Store.del(k); });
    ["workerText", "relayText", "scripts", "rules", "intercept"].forEach(function (k) { Store.del(k); });
    Toast.info("Reset", "reloading");
    setTimeout(function () { location.reload(); }, 620);
  }
  function applyState() {
    document.documentElement.setAttribute("data-theme", S.theme);
    document.body.classList.toggle("wide", S.wide);
    document.body.classList.toggle("fxoff", S.fxOff);
    document.body.classList.toggle("hard", S.hard);
    document.body.classList.remove("split2", "split4");
    if (S.split === "split2" || S.split === "split4") document.body.classList.add(S.split);
    $("vpaneB").classList.toggle("hidden", S.split === "none");
    $("vpaneC").classList.toggle("hidden", S.split !== "split4");
    $("vpaneD").classList.toggle("hidden", S.split !== "split4");
    $("btnSplit").classList.toggle("on", S.split !== "none");
    Renderer.setOpaque(S.opaque);
    Sound.set(S.sound);
    const r = $("routeSel"); if (r) r.value = S.route;
    const e = $("engineSel"); if (e) e.value = S.engine;
    const d = $("disguiseSel"); if (d) d.value = S.disguise;
    const t = $("transSel"); if (t) t.value = S.trans;
    Cloaker.apply(S.disguise);
    meter(); swStat(); wispStat(); fleetStat();
  }

  return {
    init: initFields, S: S, load: load, search: search, submit: submit,
    cycleRoute: cycleRoute, route: route, trans: trans, disguise: disguise,
    theme: theme, full: full, split: split, star: star, saveCopy: saveCopy,
    hardToggle: hardToggle, paranoidToggle: paranoidToggle, warmScram: warmScram, sound: sound,
    history: history, marks: marks, downloads: downloads, rules: rules, storage: storage,
    settings: settings, worker: worker, proxies: proxies, net: net, console: console_,
    help: help, decoyPicker: decoyPicker, fleet: fleet, renderProxies: renderProxies,
    status: status, badge: badge, lat: lat, cacheStat: cacheStat, swStat: swStat,
    wispStat: wispStat, fleetStat: fleetStat, meter: meter, progress: progress,
    copy: copy, pop: pop, exportAll: exportAll, importAll: importAll, doImport: doImport,
    resetAll: resetAll, applyState: applyState, secChip: secChip,
    onboard: onboard, stealthReport: stealthReport,
    lastUrl: function () { return lastUrl; }, setLast: function (u) { lastUrl = u; }
  };
})();

/* =============================================================================
   46  keys
   ============================================================================= */
const Keys = (function () {
  function back() {
    const r = Tabs.active();
    if (!r || r.ptr <= 0) return;
    r.ptr--;
    UI.load(r.stack[r.ptr].url);
  }
  function fwd() {
    const r = Tabs.active();
    if (!r || r.ptr >= r.stack.length - 1) return;
    r.ptr++;
    UI.load(r.stack[r.ptr].url);
  }
  function init() {
    on(document, "keydown", function (e) {
      const tag = (e.target && e.target.tagName) || "";
      const inField = tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); Palette.open(); return; }
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); Finder.open(); return; }
      if (mod && e.key.toLowerCase() === "h") { e.preventDefault(); UI.history(); return; }
      if (mod && e.key === ",") { e.preventDefault(); UI.settings(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); UI.star(); return; }
      if (mod && e.key.toLowerCase() === "l") { e.preventDefault(); const i = $("qInput"); if (i) { i.focus(); i.select(); } return; }

      if (e.key === "Escape") {
        if (Palette.isOpen()) { Palette.close(); return; }
        if (Modal.closeTop()) return;
        if (Finder.isOpen()) { Finder.close(); return; }
        if (Decoy.on()) { Decoy.hide(); return; }
        if (document.body.classList.contains("full")) { UI.full(); return; }
        return;
      }
      if (e.key === "?" && !inField) { UI.help(); return; }
      if (!e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r") { e.preventDefault(); Bus.emit("tab:reload"); }
      else if (k === "t") { e.preventDefault(); Bus.emit("tab:new"); }
      else if (k === "w") { e.preventDefault(); const t = Tabs.active(); if (t) Tabs.close(t.id); }
      else if (k === "f") { e.preventDefault(); UI.full(); }
      else if (k === "x") { e.preventDefault(); Decoy.toggle(); }
      else if (k === "e") { e.preventDefault(); Reader.toggle(); }
      else if (k === "u") { e.preventDefault(); Tools.source(); }
      else if (k === "j") { e.preventDefault(); UI.console(); }
      else if (k === "i") { e.preventDefault(); Tools.pick(); }
      else if (k === "d") { e.preventDefault(); UI.star(); }
      else if (k === "g") { e.preventDefault(); UI.cycleRoute(); }
      else if (k === "n") { e.preventDefault(); UI.net(); }
      else if (k === "m") { e.preventDefault(); UI.fleet(); }
      else if (k === "l") { e.preventDefault(); if (e.shiftKey) UI.paranoidToggle(); else UI.hardToggle(); }
      else if (k === "k") { e.preventDefault(); UI.theme(); }
      else if (k === "y") { e.preventDefault(); Diag.matrix(); }
      else if (k === "s") { e.preventDefault(); if (e.shiftKey) UI.warmScram(); else UI.saveCopy(); }
      else if (k === "\\") { e.preventDefault(); UI.split(); }
      else if (k === "1") { e.preventDefault(); Decoy.show("classroom"); }
      else if (k === "2") { e.preventDefault(); Decoy.show("docs"); }
      else if (k === "3") { e.preventDefault(); Decoy.show("drive"); }
      else if (k === "ArrowLeft") { e.preventDefault(); back(); }
      else if (k === "ArrowRight") { e.preventDefault(); fwd(); }
      else if (k === "Home") { e.preventDefault(); UI.load(CFG.home); }
    });
  }
  return { init: init, back: back, fwd: fwd };
})();

/* =============================================================================
   47  bridge
   ============================================================================= */
const Bridge = (function () {
  function init() {
    on(global, "message", function (e) {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      const rec = Tabs.active();
      switch (d.__v) {
        case "nav": if (d.href) UI.load(d.href); break;
        case "pop": if (d.href && UI.S.popTabs) UI.pop(d.href); break;
        case "title": if (rec && UI.S.titleSync && d.title) Tabs.meta(rec, d.title, null); break;
        case "icon": if (d.href && UI.S.iconSync) { Cloaker.fromSite(null, d.href); if (rec) Tabs.meta(rec, null, d.href); } break;
        case "ready": UI.progress(96); break;
        case "console": Tools.conPush(d.level || "log", d.args || []); break;
        case "jserr": Tools.conPush("err", [d.msg + (d.line ? " (line " + d.line + ")" : "")]); break;
        case "picked": Tools.showInspect(d); break;
      }
      if (typeof d.__nav === "string") UI.load(d.__nav);
    });
  }
  return { init: init };
})();

/* =============================================================================
   48  boot
   ============================================================================= */
const Boot = (function () {
  let watchdog = null, swWatch = null;
  const MSGS = ["initialising core", "parsing worker fleet", "priming circuit breakers", "probing tunnels", "restoring session", "ready"];
  const TIPS = [
    "A blob: frame has no hostname. There is nothing for a categoriser to look up.",
    "One websocket to your worker carries everything. Relay cannot see inside it.",
    "TLS terminates in the worker, so the browser never negotiates with the blocked host.",
    "School DNS is never consulted. The tunnel resolves server-side.",
    "The socket rotates before the free-plan subrequest ceiling.",
    "Alt+X flips to a fake Classroom screen instantly.",
    "Layer matrix (Alt+Y) names the exact broken layer and fixes it."
  ];

  function bootLog() {
    const el2 = $("bootLog"), tip = $("bootTip"), bar = $("bootBar"), steps = $("bootSteps");
    let i = 0;
    const timer = setInterval(function () {
      if (i >= MSGS.length) return;
      if (el2) el2.textContent = MSGS[i];
      if (tip && i % 2 === 0) tip.textContent = TIPS[(i / 2) | 0] || TIPS[0];
      if (bar) bar.style.width = Math.round((i + 1) / MSGS.length * 100) + "%";
      if (steps && steps.children[i]) steps.children[i].className = "on";
      i++;
    }, 180);
    return {
      finish: function () {
        clearInterval(timer);
        if (el2) el2.textContent = "ready";
        if (bar) bar.style.width = "100%";
        if (steps) for (let k = 0; k < steps.children.length; k++) steps.children[k].className = "ok";
        if (tip) tip.textContent = "Ready.";
      }
    };
  }

  function envLine() {
    const e = $("bootEnv");
    if (!e) return;
    e.textContent = [location.protocol.replace(":", ""), global.isSecureContext ? "secure" : "insecure",
      "serviceWorker" in navigator ? "sw" : "no-sw"].join(" \u00b7 ");
  }

  function selects() {
    const r = $("routeSel");
    if (r) {
      ROUTE_ORDER.forEach(function (x) {
        const o = document.createElement("option");
        o.value = x;
        o.textContent = x === "auto" ? "Auto (cascade)" : ROUTES[x].label;
        r.appendChild(o);
      });
      on(r, "change", function () { UI.route(r.value); });
    }
    const t = $("transSel");
    if (t) {
      TRANS_ORDER.forEach(function (x) {
        const o = document.createElement("option");
        o.value = x;
        o.textContent = TRANS[x].label;
        t.appendChild(o);
      });
      on(t, "change", function () { UI.trans(t.value); });
    }
    const e = $("engineSel");
    if (e) {
      Object.keys(ENGINES).forEach(function (k) {
        const o = document.createElement("option");
        o.value = k; o.textContent = ENGINES[k].label;
        e.appendChild(o);
      });
      on(e, "change", function () { UI.S.engine = e.value; Store.set("engine", e.value); });
    }
    const d = $("disguiseSel");
    if (d) {
      DISGUISES.forEach(function (x) {
        const o = document.createElement("option");
        o.value = x.id;
        o.textContent = x.id === "none" ? "No disguise" : (x.title === "__SITE__" ? "Site favicon" : x.title);
        d.appendChild(o);
      });
      on(d, "change", function () { UI.disguise(d.value); });
    }
  }

  function presets() {
    const h = $("presets");
    if (!h) return;
    h.innerHTML = "";
    Marks.list().slice(0, 4).forEach(function (b) {
      const c = el("span", "chip fav");
      c.innerHTML = '<span class="cdot"></span>' + esc(cut(b.title, 18));
      on(c, "click", function () { UI.load(b.url); });
      h.appendChild(c);
    });
    if (Marks.list().length) h.appendChild(el("span", "psep"));
    PRESETS.forEach(function (p) {
      const c = el("span", "chip" + (p.safe ? " safe" : ""));
      c.innerHTML = '<span class="cdot"></span>' + esc(p.label);
      c.title = p.url;
      on(c, "click", function () { UI.load(p.url); });
      h.appendChild(c);
    });
    h.appendChild(el("span", "psep"));
    [["Decoys", UI.decoyPicker], ["Get unblocked", UI.onboard], ["Matrix", Diag.matrix]].forEach(function (p) {
      const c = el("span", "chip");
      c.innerHTML = '<span class="cdot"></span>' + esc(p[0]);
      on(c, "click", p[1]);
      h.appendChild(c);
    });
  }

  function topbar() {
    on($("brand"), "click", UI.onboard);
    on($("meter"), "click", UI.stealthReport);
    on($("btnBack"), "click", Keys.back);
    on($("btnFwd"), "click", Keys.fwd);
    on($("btnHome"), "click", function () { UI.load(CFG.home); });
    on($("btnStar"), "click", UI.star);
    on($("btnHistory"), "click", UI.history);
    on($("btnReader"), "click", Reader.toggle);
    on($("btnSource"), "click", Tools.source);
    on($("btnConsole"), "click", UI.console);
    on($("btnInspect"), "click", Tools.pick);
    on($("btnNet"), "click", UI.net);
    on($("btnLS"), "click", function () { UI.hardToggle(); $("btnLS").classList.toggle("on", UI.S.hard); });
    on($("btnFleet"), "click", UI.fleet);
    on($("btnSplit"), "click", UI.split);
    on($("btnSave"), "click", UI.saveCopy);
    on($("btnPalette"), "click", Palette.open);
    on($("btnFx"), "click", FX.toggle);
    on($("btnTheme"), "click", UI.theme);
    on($("btnSettings"), "click", UI.settings);
    on($("btnHelp"), "click", UI.help);
  }

  function omnibar() {
    on($("btnGo"), "click", UI.submit);
    const q = $("qInput");
    on(q, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); UI.submit(); } });
    on(q, "paste", function () { setTimeout(function () { if (isUrl(q.value.trim())) UI.load(q.value.trim()); }, 40); });
    const u = $("urlInput");
    on(u, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); UI.load(u.value); } });
    on($("btnReload"), "click", function () { Bus.emit("tab:reload"); });
    on($("btnFull"), "click", UI.full);
    on($("btnPanic"), "click", function () { Decoy.toggle(); });
    on($("btnPop"), "click", function () { const x = UI.lastUrl(); if (x) UI.pop(x); });
    on($("btnWorker"), "click", UI.worker);
    on($("btnProxies"), "click", UI.proxies);
    on($("btnTest"), "click", Diag.matrix);

    const wi = $("workerInput");
    on(wi, "input", deb(function () {
      Fleet.parse(wi.value);
      Store.set("workerText", wi.value);
      UI.fleetStat();
      UI.meter();
      if (wi.value.trim()) {
        Fleet.pingAll().then(function (n) {
          Toast.ok(n + " node(s) alive", "tunnels ready");
          UI.fleetStat();
          UI.meter();
        });
      }
    }, 900));

    const px = $("proxyInput");
    on(px, "input", deb(function () {
      Pool.setCustoms(px.value);
      Store.set("relayText", px.value);
      Toast.ok("Relays updated", px.value ? "yours rank first" : "defaults");
    }, 700));
  }

  function modals() {
    on($("histClear"), "click", function () { History.clear().then(function () { UI.history(); Toast.ok("History cleared"); }); });
    on($("workerCopy"), "click", WorkerGen.copy);
    on($("workerDownload"), "click", WorkerGen.download);
    on($("workerReroll"), "click", function () { WorkerGen.reroll(); $("workerCode").textContent = WorkerGen.code(); });
    on($("fleetPing"), "click", function () {
      Fleet.pingAll().then(function (n) { Toast.info(n + " alive"); UI.fleetStat(); UI.fleet(); });
    });
    on($("fleetGen"), "click", function () { Modal.close("mFleet"); UI.worker(); });
    on($("proxyReprobe"), "click", function () {
      Toast.info("Probing every relay");
      Prober.all(function () { UI.renderProxies(); });
      setTimeout(UI.renderProxies, 500);
      setTimeout(UI.renderProxies, 2000);
    });
    on($("netClear"), "click", function () { NetLog.clear(); });
    on($("consoleClear"), "click", function () { Log.clear(); Tools.renderConsole(); });
    on($("consoleInput"), "keydown", function (e) {
      if (e.key !== "Enter") return;
      const v = $("consoleInput").value;
      if (!v) return;
      Tools.conPush("in", [v]);
      const d = Tools.activeDoc();
      try {
        const out = d && d.defaultView ? d.defaultView.eval(v) : eval(v);
        Tools.conPush("out", [String(out)]);
      } catch (err) { Tools.conPush("err", [err.message]); }
      $("consoleInput").value = "";
    });
    on($("inspectPick"), "click", Tools.pick);
    on($("sockGo"), "click", Tools.sockConnect);
    on($("sockWrite"), "click", Tools.sockWrite);
    on($("sockClose"), "click", Tools.sockClose);
    on($("sourceCopy"), "click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText($("sourceBody").textContent).then(function () { Toast.ok("Copied"); });
    });
    on($("dlClear"), "click", function () { Downloads.clear().then(UI.downloads); });
    on($("rulesAdd"), "click", function () {
      const u = UI.lastUrl();
      if (!u) return;
      const h = host(u);
      Rules.set(h, { route: UI.S.route, zoom: UI.S.zoom }).then(function () {
        Toast.ok("Rule added", h);
        UI.rules();
      });
    });
    on($("setExport"), "click", UI.exportAll);
    on($("setImport"), "click", UI.importAll);
    on($("setReset"), "click", UI.resetAll);
    on($("diagRun"), "click", Diag.render);
    on($("onboardDiag"), "click", function () { Modal.close("mOnboard"); Diag.matrix(); });
    on($("diagCopy"), "click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText($("diagBody").innerText).then(function () { Toast.ok("Copied"); });
    });
    on($("fileImport"), "change", function (e) {
      const f = e.target.files && e.target.files[0];
      if (f) UI.doImport(f);
      e.target.value = "";
    });
  }

  function finder() {
    const i = $("findInput");
    on(i, "input", deb(function () { Finder.run(i.value); }, 150));
    on(i, "keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) Finder.prev(); else Finder.next(); }
      if (e.key === "Escape") { e.preventDefault(); Finder.close(); }
    });
    on($("findNext"), "click", Finder.next);
    on($("findPrev"), "click", Finder.prev);
    on($("findClose"), "click", Finder.close);
  }

  function bus() {
    Bus.on("tab:new", function () {
      const r = Tabs.create("", { title: "New tab" });
      Tabs.activate(r.id);
      const i = $("qInput");
      if (i) { i.value = ""; i.focus(); }
    });
    Bus.on("tab:reload", function () {
      const u = UI.lastUrl();
      if (u) UI.load(u); else Toast.info("Nothing to reload");
    });
    Bus.on("tab:active", function (r) {
      if (r && r.url) { const u = $("urlInput"); if (u) u.value = r.url; }
      if (r && r.frame) {
        try { const d = r.frame.contentDocument; if (d && d.title) Tabs.meta(r, d.title, null); } catch (e) {}
      }
      Finder.refresh();
    });
    Bus.on("probe:item", function () { dots(); Radar.draw(); });
    Bus.on("probe:done", function () { dots(); Radar.draw(); });
    Bus.on("pool:breaker", function (i) { Toast.warn("Relay tripped", i.label); });
    Bus.on("pool:note", function () { dots(); Radar.draw(); });
    Bus.on("fleet:note", function () { UI.fleetStat(); });
    Bus.on("fleet:dead", function (f) { Toast.warn("Worker dropped", phost(f.base)); UI.fleetStat(); });
    Bus.on("fleet:rotate", function () { UI.wispStat(); });
    Bus.on("wisp:down", function () { UI.wispStat(); });
    Bus.on("wisp:rotate", function () { UI.wispStat(); });
    Bus.on("net:done", function () { UI.cacheStat(); });
    Bus.on("dl:new", function () { if ($("mDownloads").classList.contains("open")) UI.downloads(); });
    Bus.on("marks:changed", presets);
    Bus.on("sj:stage", function (s) {
      const map = { libs: "scramjet \u00b7 loading rewriter", sw: "scramjet \u00b7 registering worker", controller: "scramjet \u00b7 controller", transport: "scramjet \u00b7 transport" };
      if (map[s.stage]) UI.status(map[s.stage], "busy");
    });
    Bus.on("sj:ready", function (kind) {
      Toast.ok("Scramjet online", "transport: " + kind);
      UI.swStat();
      UI.meter();
    });
    Bus.on("sj:url", function (u) {
      const rec = Tabs.active();
      if (!rec) return;
      rec.url = u;
      UI.setLast(u);
      Tabs.meta(rec, phost(u), Favicons.live(u));
      const i = $("urlInput"); if (i) i.value = u;
    });
    Bus.on("log", function (r) {
      if (r.lvl === "err" || r.lvl === "warn") {
        Tools.conPush(r.lvl === "err" ? "err" : "warn", Array.prototype.slice.call(r.args).map(String));
      }
    });
  }

  function dots() {
    const h = $("pdots");
    if (!h) return;
    h.innerHTML = "";
    Fleet.all().slice(0, 4).forEach(function (n) {
      const d = el("i", n.parked ? "wn" : "ok");
      d.title = n.base;
      h.appendChild(d);
    });
    Pool.relays().slice(0, 11).forEach(function (p) {
      const d = el("i", Pool.health(p));
      d.title = p.label + " " + Pool.score(p);
      h.appendChild(d);
    });
  }

  function win() {
    on(global, "blur", function () { if (UI.S.autoDecoy && !Decoy.on()) Decoy.show(UI.S.decoy); });
    on(global, "focus", function () { if (UI.S.autoDecoy && Decoy.on()) Decoy.hide(); });
    on(document, "visibilitychange", function () {
      if (!UI.S.autoDecoy) return;
      if (document.hidden) Decoy.show(UI.S.decoy); else Decoy.hide();
    });
    on(global, "online", function () { $("offline").classList.remove("on"); Toast.ok("Back online"); });
    on(global, "offline", function () { $("offline").classList.add("on"); Toast.warn("Offline"); });
    if (!navigator.onLine) $("offline").classList.add("on");
    on(global, "error", function (e) { Log.warn("window", e.message); });
  }

  function ripple() {
    on(document, "pointerdown", function (e) {
      const t = e.target;
      if (!t || !t.closest) return;
      const b = t.closest(".btn,.ib,.chip,.tab");
      if (!b) return;
      const r = b.getBoundingClientRect();
      const sz = Math.max(r.width, r.height);
      const s = el("span", "rip");
      s.style.width = s.style.height = sz + "px";
      s.style.left = (e.clientX - r.left - sz / 2) + "px";
      s.style.top = (e.clientY - r.top - sz / 2) + "px";
      b.appendChild(s);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 620);
      Sound.tap();
    }, true);
  }

  /* fixed: grid-based splitters, they write grid templates not flex */
  function splitters() {
    const v = $("splitV"), h = $("splitH"), h2 = $("splitH2");

    on(v, "pointerdown", function (e) {
      if (!document.body.classList.contains("split2") && !document.body.classList.contains("split4")) return;
      v.classList.add("on");
      v.setPointerCapture(e.pointerId);
    });
    on(v, "pointermove", function (e) {
      if (!v.classList.contains("on")) return;
      const r = $("view").getBoundingClientRect();
      const pct = clamp((e.clientX - r.left) / r.width, .18, .82);
      $("view").style.gridTemplateColumns = (pct * 100) + "% 6px 1fr";
    });
    on(v, "pointerup", function () { v.classList.remove("on"); });

    function hDrag(el2, row) {
      on(el2, "pointerdown", function (e) {
        if (!document.body.classList.contains("split4")) return;
        el2.classList.add("on");
        el2.setPointerCapture(e.pointerId);
      });
      on(el2, "pointermove", function (e) {
        if (!el2.classList.contains("on")) return;
        const r = $("view").getBoundingClientRect();
        const pct = clamp((e.clientY - r.top) / r.height, .18, .82);
        $("view").style.gridTemplateRows = (pct * 100) + "% 6px 1fr";
        void row;
      });
      on(el2, "pointerup", function () { el2.classList.remove("on"); });
    }
    if (h) hDrag(h, 1);
    if (h2) hDrag(h2, 2);
  }

  function swWatchdog() {
    if (swWatch) return;
    swWatch = setInterval(function () {
      if (!UI.S.swOn) return;
      if (!SJ.live()) return;
      if (navigator.serviceWorker && !navigator.serviceWorker.controller) {
        UI.swStat();
        SJ.registerSW().then(function () { SJ.pushCfg(); }).catch(function () {});
      }
    }, 30000);
  }

  function restore() {
    return Store.get("settings", null).then(function (saved) {
      if (saved && typeof saved === "object") {
        Object.keys(saved).forEach(function (k) { if (k in UI.S) UI.S[k] = saved[k]; });
      }
      return Store.get("workerText", "").then(function (w) {
        if (w) { const i = $("workerInput"); if (i) i.value = w; Fleet.parse(w); }
        return Store.get("relayText", "").then(function (rx) {
          if (rx) { const i = $("proxyInput"); if (i) i.value = rx; }
          return Store.get("wispBudget", CFG.wispBudget).then(function (b) {
            if (b) CFG.wispBudget = b;
            return Store.get("sessionFull", null);
          });
        });
      });
    });
  }

  const persistDeb = deb(function () {
    const S = UI.S;
    Store.set("settings", {
      route: S.route, trans: S.trans, engine: S.engine, disguise: S.disguise, decoy: S.decoy,
      wide: S.wide, theme: S.theme, fxOff: S.fxOff, autoDecoy: S.autoDecoy, subInline: S.subInline,
      swOn: S.swOn, probeBoot: S.probeBoot, titleSync: S.titleSync, iconSync: S.iconSync,
      popTabs: S.popTabs, opaque: S.opaque, credless: S.credless, zoom: S.zoom,
      boringBias: S.boringBias, cacheBust: S.cacheBust, hard: S.hard, paranoid: S.paranoid,
      sound: S.sound, viewTrans: S.viewTrans, stealthScrub: S.stealthScrub, nativeify: S.nativeify,
      split: S.split, transportEngine: S.transportEngine, wispRotate: S.wispRotate,
      raceStreams: S.raceStreams, autoHeal: S.autoHeal, autoRestore: S.autoRestore
    });
    Session.save();
  }, 800);

  function run() {
    let restoredSession = null;
    const bl = bootLog();
    envLine();

    watchdog = setTimeout(function () {
      const b = $("boot");
      if (b && !b.classList.contains("gone")) {
        bl.finish();
        b.classList.add("gone");
        UI.status("boot watchdog fired", "warn");
      }
    }, 7000);

    try {
      Cloaker.init(); Decoy.init(); Tabs.init(); Modal.init(); Palette.init();
      UI.init(); FX.init(); Radar.init(); Keys.init(); Bridge.init(); NetLog.init();
      selects(); topbar(); omnibar(); modals(); finder(); bus(); win(); ripple();
      splitters(); dots();
    } catch (e) {
      Log.err("wiring", e.message);
      UI.status("wiring error: " + e.message, "bad");
    }

    Store.init()
      .then(function () { return Promise.all([History.load(), Marks.load(), Affinity.init(), UserScripts.load(), Rules.load(), Intercept.load(), Downloads.load()]); })
      .then(function () { presets(); return restore(); })
      .then(function (session) {
        if (UI.S.stealthScrub) Stealth.hardenBuiltins();
        Pool.setCustoms($("proxyInput") ? $("proxyInput").value : "");
        UI.applyState();
        if (UI.S.hard) $("btnLS").classList.add("on");
        restoredSession = session;
        return Pool.init();
      })
      .then(function () {
        let session = restoredSession;
        dots();
        Radar.draw();
        UI.fleetStat();

        const startUrl = UI.lastUrl() || CFG.home;
        const rec = Tabs.create(startUrl, { title: phost(startUrl), icon: Favicons.live(startUrl) });
        Tabs.activate(rec.id);
        UI.status("ready \u00b7 Ctrl+K for commands", "");
        UI.badge("-", 0);
        UI.secChip("", "idle");
        UI.cacheStat();
        UI.meter();
        UI.load(startUrl, { toast: false });

        if (UI.S.probeBoot) setTimeout(function () { Prober.all(dots); }, 700);
        if (Fleet.all().length) setTimeout(function () { Fleet.pingAll().then(UI.fleetStat); }, 900);
        setInterval(function () { if (!document.hidden) Prober.all(dots); }, 260000);
        setInterval(function () { if (!document.hidden && Fleet.all().length) Fleet.pingAll().then(UI.fleetStat); }, 90000);
        swWatchdog();

        on(document, "click", persistDeb);
        setInterval(persistDeb, 13000);

        setTimeout(function () {
          clearTimeout(watchdog);
          bl.finish();
          const b = $("boot");
          const sh = $("shell");
          if (sh) sh.classList.add("in");
          if (b) { b.classList.add("gone"); setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 900); }
          if (UI.S.autoDecoy) Toast.info("Auto decoy is on", "alt-tab away to test");
          if (location.protocol === "file:") Toast.warn("Running from file://", "no service worker here - host on pages.dev");
          else if (!Fleet.all().length) Toast.info("Deploy a worker", "it is the whole bypass");
          if (session && session.tabs && session.tabs.length && UI.S.autoRestore) {
            Toast.info("Session restored", session.tabs.length + " tab(s)");
            session.tabs.slice(0, 8).forEach(function (t) {
              if (!t.url) return;
              const r = Tabs.create(t.url, { title: t.title || phost(t.url), side: t.side || "a" });
              if (t.side && t.side !== "a") $("vpane" + t.side.toUpperCase()).classList.remove("hidden");
              Tabs.activate(r.id);
              UI.load(t.url, { toast: false, side: t.side || "a" });
            });
          }
          UI.meter();
        }, 420);
      })
      .catch(function (e) {
        Log.err("boot", e.message);
        clearTimeout(watchdog);
        bl.finish();
        const b = $("boot");
        if (b) b.classList.add("gone");
        const sh = $("shell");
        if (sh) sh.classList.add("in");
        UI.status("boot error: " + e.message, "bad");
        if (!Tabs.count()) {
          const r = Tabs.create(CFG.home, { title: "DuckDuckGo" });
          Tabs.activate(r.id);
          UI.load(CFG.home, { toast: false });
        }
      });
  }

  return { run: run };
})();

/* go */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () { setTimeout(Boot.run, 16); });
} else {
  setTimeout(Boot.run, 16);
}

VELA.version = VERSION;
VELA.api = {
  load: function (u) { UI.load(u); },
  route: function (r) { UI.route(r); },
  hard: function () { UI.hardToggle(); },
  paranoid: function () { UI.paranoidToggle(); },
  stealth: function () { return Stealth.score(); },
  selftest: function () { return Stealth.selfTest(); },
  fleet: function () { return Fleet.all(); },
  ping: function () { return Fleet.pingAll(); },
  relays: function () { return Pool.relays(); },
  wisp: function () { return Wisp.stats(); },
  doh: function (n) { return DoH.query(n); },
  wispFetch: function (u) { return WispHTTP.request(u); },
  worker: function () { return WorkerGen.code(); },
  matrix: function () { return Diag.matrix(); },
  store: Store, bus: Bus
};

})(typeof window !== "undefined" ? window : this);