const fs = require("fs");
const path = require("path");

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".js")) fixFile(p);
  }
}

function fixFile(p) {
  let src = fs.readFileSync(p, "utf8");
  src = src.replace(/(from\s+["'])(\.[^"']+?)(["'])/g, (m, pre, spec, post) => {
    if (/\.[a-zA-Z0-9]+$/.test(spec)) return m;
    return pre + spec + ".js" + post;
  });
  fs.writeFileSync(p, src);
}

walk("dist");
console.log("done");
