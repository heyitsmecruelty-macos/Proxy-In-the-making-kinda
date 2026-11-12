const fs = require("fs");
const FILE = "index.html";
if (!fs.existsSync(FILE)) { console.error("no index.html in " + process.cwd()); process.exit(1); }

let src = fs.readFileSync(FILE, "utf8");
const orig = src;
let applied = 0;
const skipped = [];

function sub(label, find, replace) {
  const before = src;
  src = src.replace(find, replace);
  if (src === before) skipped.push(label); else applied++;
}

sub("css", /\/\* ={10,} animations ={10,} \*\//,
`/* ============================ additions ============================ */
.legend{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:var(--fg3);line-height:1.7}
.legend b{font-family:var(--f-mono);font-size:10px;padding:2px 6px;border-radius:var(--rp);
border:1px solid var(--ln1);color:var(--fg2);font-weight:600}
.qfix{display:flex;flex-wrap:wrap;gap:6px}
.qfix button{font-size:11px;padding:5px 10px;border-radius:var(--rp);border:1px solid var(--ln1);
background:var(--bg2);color:var(--fg2);transition:border-color var(--tf),color var(--tf)}
.qfix button:hover{border-color:var(--ac);color:var(--fg0)}
/* ============================ animations ============================ */`);

sub("selftest-btn",
  /(<button class="btn gho tiny" id="btnTest">[\s\S]*?<\/button>)/,
  `$1
        <button class="btn gho tiny" id="btnSelfTest"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>Self test</button>`);

sub("legend", /(<nav class="presets" id="presets"><\/nav>)/,
`<div class="legend" id="legend">
      <span>site blocked?</span><b>scramjet</b><span>rewrites every request through the worker</span>
      <b>src</b><span>fastest, but assets hit the real host and get filtered</span>
    </div>
    <div class="qfix">
      <button id="qfScram">Use scramjet</button>
      <button id="qfTls">Force wisp tls</button>
      <button id="qfBudget">Budget 12</button>
      <button id="qfDiag">Layer matrix</button>
    </div>
    $1`);

sub("wiring", /(<script src="vela\.js" defer><\/script>)/,
`$1
<script>
document.addEventListener("DOMContentLoaded", function () {
  function pick(id, val) {
    var s = document.getElementById(id);
    if (!s) return;
    s.value = val;
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }
  var g = function (id) { return document.getElementById(id); };
  if (g("qfScram")) g("qfScram").onclick = function () { pick("routeSel", "scramjet"); };
  if (g("qfTls")) g("qfTls").onclick = function () { pick("transSel", "wisptls"); };
  if (g("qfBudget")) g("qfBudget").onclick = function () {
    var w = g("workerInput");
    if (w && window.VELA && VELA.api && VELA.api.store) {
      try { VELA.api.store("wispBudget", 12); } catch (e) {}
    }
    pick("routeSel", "scramjet");
  };
  if (g("qfDiag")) g("qfDiag").onclick = function () {
    if (window.VELA && VELA.api && VELA.api.matrix) { try { VELA.api.matrix(); } catch (e) {} }
  };
  if (g("btnSelfTest")) g("btnSelfTest").onclick = function () {
    if (window.VELA && VELA.api && VELA.api.selftest) { try { VELA.api.selftest(); } catch (e) {} }
  };
});
</script>`);

sub("boottip", /Waking tunnels and ranking them by latency\.\.\./,
  "Waking tunnels and ranking them by latency. Route scramjet for blocked hosts.");

if (src === orig) { console.error("no patch matched - wrong file?"); process.exit(1); }
fs.copyFileSync(FILE, FILE + ".bak");
fs.writeFileSync(FILE, src);
console.log("ui patched, applied " + applied);
if (skipped.length) console.log("SKIPPED, tell me: " + skipped.join(", "));