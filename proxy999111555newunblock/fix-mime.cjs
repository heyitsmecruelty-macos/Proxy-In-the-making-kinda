const fs = require("fs");
const FILE = "index.html";
if (!fs.existsSync(FILE)) { console.error("no index.html here"); process.exit(1); }

let src = fs.readFileSync(FILE, "utf8");
const orig = src;

const OLD = '<script src="vela.js" defer></script>';
const NEW = `<script>
fetch("vela.js").then(function (r) { return r.text(); }).then(function (t) {
  var s = document.createElement("script");
  s.textContent = t;
  document.head.appendChild(s);
}).catch(function () {
  var l = document.getElementById("bootLog");
  if (l) l.textContent = "vela.js fetch failed";
});
</script>`;

src = src.replace(OLD, NEW);

if (src === orig) { console.error("anchor not found - is this the patched index.html?"); process.exit(1); }

fs.copyFileSync(FILE, FILE + ".bak2");
fs.writeFileSync(FILE, src);
console.log("done - re-upload index.html now");