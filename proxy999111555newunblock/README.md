# Vela 13

A browser in a tab that survives Lightspeed Relay. No `translate.goog` anywhere.

## Files

| file | needed | what |
|---|---|---|
| `index.html` | yes | shell |
| `vela.js` | yes | engine |
| `cache.js` | strongly recommended | service worker, innocuous name on purpose |
| `cf-worker.js` | **the important one** | Worker: wisp tunnel, wisp-tls, relay, DoH |
| `README.md` | no | this |

Missing `cache.js`? `vela.js` regenerates an identical worker from a blob, so
the two-file version still runs.

## Deploy

**1. Worker first.** dash.cloudflare.com -> Workers & Pages -> Create Worker ->
paste `cf-worker.js` -> Deploy. Open the url, copy it.

**2. Shell.** Drag the folder onto pages.cloudflare.com. You get `*.pages.dev`,
a host Lightspeed has no category for. (`file://` works but has no service
worker, so scramjet is unavailable there.)

**3. App.** Paste the worker url into the **worker** box. The chip must read
`live`. Shield icon for hardened mode. Alt+Y for the layer matrix.

## Why this holds

- **The frame has no hostname.** `blob:`, `srcdoc`, `about:blank` have no URL to
  look up. Nothing to categorise.
- **The traffic is opaque.** One `wss://` to your Worker. Lightspeed sees a
  websocket to an unclassified host. Inside, arbitrary TCP.
- **TLS terminates in the Worker.** The browser never negotiates TLS with a
  blocked host, so there is no SNI to inspect and no certificate to MITM.
- **School DNS is never consulted.** Resolution happens server-side, or through
  the Worker's `/doh`.
- **Nothing looks like a proxy.** `cache.js` not `sw.js`, `/p/` not
  `/scramjet/`, `$scramjet` deleted after boot, every patched builtin forged to
  `[native code]`.
- **It does not die.** The socket rotates before the free-plan subrequest
  ceiling. Streams race across two nodes. A dead node is quarantined. A failed
  route silently downgrades.

## If something breaks

1. `Alt+Y`. The matrix names the broken layer and the fix button is on the row.
2. Chip reads `no worker` -> you never pasted the host.
3. `Alt+M`, Ping all. Red rows, drop them, deploy another.
4. Route -> **Airgap**. Inlines every asset, frame contacts nobody.
5. Transport -> **Wisp tunnel only**.
6. `Alt+Shift+L` paranoid.

## Limits worth knowing

Free-plan Workers allow ~50 outbound connections per request. The app rotates at
34 by default (settings, lower is safer). Paid raises it to 1000 — set the budget
to 80 and rotation mostly stops happening.

Websockets inside proxied pages need `libcurl` transport; the native engine
covers HTTP fine.

## Shortcuts

`Ctrl K` palette · `Alt L` hardened · `Alt Shift L` paranoid · `Alt M` fleet ·
`Alt X` panic · `Alt Y` matrix · `Alt E` reader · `Alt J` console · `Alt I`
inspect · `Alt U` source · `Alt G` next route · `Alt 1/2/3` fake
Classroom/Docs/Drive · `Alt \` split

## Console API

`VELA.api.stealth()` `.selftest()` `.matrix()` `.fleet()` `.ping()` `.doh(n)`
`.wispFetch(u)` `.relays()`