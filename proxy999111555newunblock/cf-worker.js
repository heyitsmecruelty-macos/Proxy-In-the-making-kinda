/* =============================================================================
   cf-worker.js  ::  vela tunnel worker
   -----------------------------------------------------------------------------
   deploy: dash.cloudflare.com -> Workers & Pages -> Create Worker -> paste -> Deploy

   then paste https://<you>.workers.dev into the app's wisp box.

     wss://<you>.workers.dev/wisp/       raw TCP      (scramjet / libcurl)
     wss://<you>.workers.dev/wisp-tls/   server-side TLS, plain HTTP inside
     https://<you>.workers.dev/relay?url=  DNS resolved in Cloudflare, never at school
     https://<you>.workers.dev/doh?name=   DoH passthrough

   free plan is fine. paid raises the concurrent-connection ceiling.
   ============================================================================= */

import { connect } from "cloudflare:sockets";

const PKT = { CONNECT: 1, DATA: 2, CONTINUE: 3, CLOSE: 4, INFO: 5 };
const BUF = 64;

const STRIP = [
  "content-security-policy", "content-security-policy-report-only", "x-frame-options",
  "cross-origin-embedder-policy", "cross-origin-opener-policy", "cross-origin-resource-policy",
  "permissions-policy", "strict-transport-security", "report-to", "nel", "alt-svc", "set-cookie",
  "content-encoding", "content-length"
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "*",
  "access-control-max-age": "86400"
};

/* ---------------------------------------------------------------- wisp ---- */
function u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; }
function u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; }

function frame(type, sid, payload) {
  const head = new Uint8Array(5);
  head[0] = type;
  new DataView(head.buffer).setUint32(1, sid, true);
  if (!payload || !payload.length) return head;
  const out = new Uint8Array(5 + payload.length);
  out.set(head, 0);
  out.set(payload, 5);
  return out;
}

function wispUpgrade(request, doTls) {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const streams = new Map();

  function send(type, sid, payload) {
    try { server.send(frame(type, sid, payload)); } catch (e) {}
  }

  /* spec requires the very first packet to be CONTINUE for stream 0 */
  send(PKT.CONTINUE, 0, u32(BUF));

  function killStream(sid, reason) {
    const s = streams.get(sid);
    if (!s) return;
    streams.delete(sid);
    try { s.writer.close(); } catch (e) {}
    try { s.reader.cancel(); } catch (e) {}
    if (reason) send(PKT.CLOSE, sid, new Uint8Array([reason]));
  }

  async function onMessage(ev) {
    const buf = new Uint8Array(ev.data);
    if (buf.length < 5) return;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const type = buf[0];
    const sid = dv.getUint32(1, true);
    const payload = buf.subarray(5);

    if (type === PKT.CONNECT) {
      if (payload.length < 4) return send(PKT.CLOSE, sid, new Uint8Array([0x41]));
      const streamType = payload[0];
      const port = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint16(1, true);
      const hostname = new TextDecoder().decode(payload.subarray(3));
      if (!hostname || !port) return send(PKT.CLOSE, sid, new Uint8Array([0x41]));

      /* udp is rare; fall through to tcp */
      const secure = (doTls && (port === 443 || port === 8443)) ? "on" : "off";

      let socket;
      try {
        socket = connect({ hostname: hostname, port: port }, { secureTransport: secure });
      } catch (e) {
        return send(PKT.CLOSE, sid, new Uint8Array([0x41]));
      }

      const writer = socket.writable.getWriter();
      const reader = socket.readable.getReader();
      streams.set(sid, { socket: socket, writer: writer, reader: reader });
      send(PKT.CONTINUE, sid, u32(BUF));

      (async function pump() {
        try {
          for (;;) {
            const r = await reader.read();
            if (r.done) break;
            const chunk = r.value instanceof Uint8Array ? r.value : new Uint8Array(r.value);
            if (chunk.length) send(PKT.DATA, sid, chunk);
          }
          killStream(sid, 0x02);
        } catch (e) {
          killStream(sid, 0x03);
        }
      })();
      return;
    }

    if (type === PKT.DATA) {
      const s = streams.get(sid);
      if (!s) return;
      try { await s.writer.write(payload); }
      catch (e) { killStream(sid, 0x03); }
      return;
    }

    if (type === PKT.CLOSE) { killStream(sid, 0); return; }
    if (type === PKT.CONTINUE) {
      /* client telling us it has room - nothing to do, we are unpaced */
      return;
    }
  }

  server.addEventListener("message", function (ev) { onMessage(ev); });
  server.addEventListener("close", function () {
    Array.from(streams.keys()).forEach(function (sid) { killStream(sid, 0); });
  });

  return new Response(null, { status: 101, webSocket: client });
}

/* --------------------------------------------------------------- relay ---- */
function targetOf(url) {
  let raw = url.searchParams.get("url") || url.searchParams.get("u");
  if (!raw) {
    const p = url.pathname.replace(/^\/+/, "");
    if (/^https?:\/\//i.test(p)) raw = decodeURIComponent(p);
    else if (p && p !== "relay") raw = "https://" + decodeURIComponent(p);
  }
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  try { return new URL(raw).href; } catch (e) { return null; }
}

function cleanHeaders(src, extra) {
  const h = new Headers();
  for (const [k, v] of src.entries()) {
    if (STRIP.indexOf(k.toLowerCase()) !== -1) continue;
    h.set(k, v);
  }
  for (const k in extra) h.set(k, extra[k]);
  return h;
}

function rewriteCss(css, base, origin) {
  return css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, function (m, u) {
    if (/^(data:|blob:|#|https?:\/\/)/i.test(u)) return m;
    try { return 'url("' + origin + "/relay?url=" + encodeURIComponent(new URL(u, base).href) + '")'; }
    catch (e) { return m; }
  });
}

async function relay(request, url) {
  const t = targetOf(url);
  if (!t) {
    return new Response("vela relay :: ?url=https://example.com", {
      headers: Object.assign({ "content-type": "text/plain" }, CORS)
    });
  }

  const fh = new Headers();
  fh.set("user-agent", request.headers.get("user-agent") ||
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36");
  fh.set("accept", request.headers.get("accept") || "*/*");
  fh.set("accept-language", request.headers.get("accept-language") || "en-US,en;q=0.9");
  const range = request.headers.get("range");
  if (range) fh.set("range", range);

  const opts = { method: request.method, headers: fh, redirect: "follow" };
  const cf = { cacheTtl: 30, cacheEverything: true, scrapeShield: false };
  const ip = url.searchParams.get("ip");
  if (ip) cf.resolveOverride = ip;
  opts.cf = cf;

  let up;
  try { up = await fetch(t, opts); }
  catch (e) { return new Response("upstream: " + e.message, { status: 502, headers: CORS }); }

  const h = cleanHeaders(up.headers, CORS);
  const type = (h.get("content-type") || "").toLowerCase();

  if (type.indexOf("text/html") !== -1 || type.indexOf("application/xhtml") !== -1) {
    let body = await up.text();
    const inject = '<base href="' + t + '" target="_self">';
    if (/<head[^>]*>/i.test(body)) body = body.replace(/<head([^>]*)>/i, "<head$1>" + inject);
    else body = inject + body;
    h.set("content-type", "text/html; charset=utf-8");
    return new Response(body, { status: up.status, headers: h });
  }

  if (type.indexOf("text/css") !== -1) {
    const body = rewriteCss(await up.text(), t, url.origin);
    h.set("content-type", "text/css; charset=utf-8");
    return new Response(body, { status: up.status, headers: h });
  }

  return new Response(up.body, { status: up.status, headers: h });
}

/* --------------------------------------------------------------- entry ---- */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (p === "/__ping" || p === "/ping") return new Response("vela-ok", { headers: CORS });

    if (p.indexOf("/wisp-tls") === 0) return wispUpgrade(request, true);
    if (p.indexOf("/wisp") === 0) return wispUpgrade(request, false);

    if (p === "/doh") {
      const name = url.searchParams.get("name");
      const type = url.searchParams.get("type") || "A";
      if (!name) return new Response("{}", { headers: Object.assign({ "content-type": "application/json" }, CORS) });
      const r = await fetch(
        "https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(name) + "&type=" + encodeURIComponent(type),
        { headers: { accept: "application/dns-json" } }
      );
      return new Response(await r.text(), {
        headers: Object.assign({ "content-type": "application/json" }, CORS)
      });
    }

    if (p === "/" && !url.searchParams.get("url")) {
      const host = url.host;
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>vela tunnel</title>' +
        '<body style="font:14px system-ui;background:#0a1120;color:#c3cfe6;padding:40px;line-height:1.8">' +
        '<h1 style="font-size:18px">vela tunnel is up</h1>' +
        '<p>wisp (raw): <code>wss://' + host + '/wisp/</code></p>' +
        '<p>wisp (tls): <code>wss://' + host + '/wisp-tls/</code></p>' +
        '<p>relay: <code>https://' + host + '/relay?url=</code></p>' +
        '<p>doh: <code>https://' + host + '/doh?name=</code></p>' +
        '<p style="color:#57678a">paste <b>https://' + host + '</b> into the wisp box in the app.</p>',
        { headers: Object.assign({ "content-type": "text/html; charset=utf-8" }, CORS) }
      );
    }

    return relay(request, url);
  }
};