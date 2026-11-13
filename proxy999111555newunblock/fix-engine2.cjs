const fs = require("fs");
const FILE = "vela.js";
if (!fs.existsSync(FILE)) { console.error("no vela.js here"); process.exit(1); }

let src = fs.readFileSync(FILE, "utf8");
const orig = src;
let applied = 0;
const skipped = [];

function blockEnd(s, needle) {
  const a = s.indexOf(needle);
  if (a === -1) return null;
  let i = s.indexOf("{", a);
  let d = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return i; }
  }
  return null;
}

function replaceBlock(label, needle, text) {
  const a = src.indexOf(needle);
  const b = blockEnd(src, needle);
  if (a === -1 || b === null) { skipped.push(label); return; }
  src = src.slice(0, a) + text + src.slice(b + 1);
  applied++;
}

function sub(label, find, replace) {
  const before = src;
  src = src.replace(find, replace);
  if (src === before) skipped.push(label); else applied++;
}

/* 1 + 2. Stream: buffer pre-handler data, flush on attach */
replaceBlock("stream", "function Stream(client, id, host, port) {",
`function Stream(client, id, host, port) {
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
}`);

replaceBlock("stream-data", "Stream.prototype._data = function (payload) {",
`Object.defineProperty(Stream.prototype, "onData", {
  configurable: true,
  get: function () { return this._onData; },
  set: function (fn) {
    this._onData = fn;
    if (fn && this.pre.length) {
      var q = this.pre;
      this.pre = [];
      for (var i = 0; i < q.length; i++) { try { fn(q[i]); } catch (e) {} }
    }
  }
});
Stream.prototype._data = function (payload) {
  this.client.lastUse = Date.now();
  if (this._onData) this._onData(payload);
  else if (this.pre.length < 64) this.pre.push(payload);
};`);

/* 3. race requeues the winning packet */
sub("race-first-packet",
  /[ \t]*if \(st\.__wrapped\)[^\n]*\n[ \t]*st\.__first = payload;\n([ \t]*)resolve\(st\);/,
`st._onData = null;
            st.pre.unshift(payload);
            resolve(st);`);

/* 4. WTrans: framing, handshake, pong, close */
(function () {
  const a = src.indexOf("const WTrans = (function () {");
  const b = blockEnd(src, "const WTrans = (function () {");
  if (a === -1 || b === null) return skipped.push("wtrans");
  let e = b + 1;
  while (e < src.length && src[e] !== "\n") e++;
  src = src.slice(0, a) + `const WTrans = (function () {
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
      st.write(enc.encode(lines.join("\\r\\n")));

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
        const head = new TextDecoder().decode(all.subarray(0, end)).split("\\r\\n");
        const statusLine = head.shift() || "";
        const m = statusLine.match(/^HTTP\\/1\\.[01]\\s+(\\d{3})\\s*(.*)$/);
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
      st.write(enc.encode(lines.join("\\r\\n")));

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
})();` + src.slice(e);
  applied++;
})();

/* 5-8. config */
sub("budget", /wispBudget:\s*34/, "wispBudget: 12");
sub("fetch-timeout", /fetch:\s*14000/, "fetch: 22000");
sub("sub-timeout", /sub:\s*9000/, "sub: 16000");
sub("no-brotli", /"Accept-Encoding: gzip, deflate, br"/, '"Accept-Encoding: gzip, deflate"');
sub("swsource-prefix-1", /u\.indexOf\(P\) !== -1/, "u.indexOf(location.origin + P) === 0");
sub("swsource-prefix-2", /u\.indexOf\(PREFIX\) !== -1/, "u.indexOf(location.origin + PREFIX) === 0");

/* 9. boot session */
sub("boot-session-decl", /(function run\(\) \{\n)/, "$1    let restoredSession = null;\n");
sub("boot-session-store",
  /([ \t]*)return Pool\.init\(\);\n([ \t]*)\}\)\n([ \t]*)\.then\(function \(session\) \{\n([ \t]*)dots\(\);/,
`$1restoredSession = session;
$1return Pool.init();
$2})
$3.then(function () {
$4let session = restoredSession;
$4dots();`);

if (src === orig) { console.error("nothing matched"); process.exit(1); }
fs.copyFileSync(FILE, FILE + ".bak3");
fs.writeFileSync(FILE, src);
console.log("applied " + applied);
if (skipped.length) console.log("SKIPPED: " + skipped.join(", "));