// Ravel build script.
//
// Two different module strategies are required here, and mixing them up
// is exactly what broke tracking before:
//
//   - background/serviceWorker.ts + everything the extension *pages*
//     (popup, dashboard, options) import is compiled by tsc into real
//     ES modules. That's safe because service workers declared with
//     "type": "module" and <script type="module"> in HTML both give a
//     genuine module context.
//
//   - content/genericTracker.ts (+ platformDetection + adapters) is
//     bundled by esbuild into a single dependency-free IIFE. Content
//     scripts registered via manifest.json's content_scripts CANNOT be
//     ES modules, there is no "type": "module" option for them, so
//     any top-level `import` there throws "Cannot use import statement
//     outside a module" and the script silently never runs.
//
// Output lands in dist_pkg/, which is a ready-to-"Load unpacked" folder.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import esbuild from "esbuild";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const PKG = join(ROOT, "dist_pkg");

function run(cmd, args) {
  // Windows needs the .cmd shim (and shell:true to resolve it), a bare
  // "node_modules/.bin/tsc" with no extension isn't directly executable
  // via CreateProcess the way it is on POSIX via its shebang line.
  execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
}

console.log("→ cleaning previous build output");
rmSync(DIST, { recursive: true, force: true });
rmSync(PKG, { recursive: true, force: true });

console.log("→ tsc (background, storage, analysis, shared, popup, dashboard, options)");
run(join("node_modules", ".bin", "tsc"), ["-p", "tsconfig.json"]);

console.log("→ rewriting bare relative imports to explicit .js specifiers (browsers require them)");
run("node", ["fix-esm.cjs"]);

console.log("→ bundling content script as a dependency-free IIFE");
await esbuild.build({
  entryPoints: ["src/content/genericTracker.ts"],
  outfile: join(DIST, "content.bundle.js"),
  bundle: true,
  format: "iife",
  target: "chrome110",
});

console.log("→ assembling dist_pkg/");
function copyJsDir(name) {
  mkdirSync(join(PKG, name), { recursive: true });
  cpSync(join(DIST, name), join(PKG, name), {
    recursive: true,
    // Checks the entry's own basename, not the full path, the project can
    // sit under a directory whose NAME contains a dot (e.g. "V3.0"), which
    // would otherwise make this filter reject the whole tree at the root.
    filter: (src) => {
      const base = basename(src);
      return !existsSync(src) || base.endsWith(".js") || !base.includes(".");
    },
  });
}
for (const dir of ["background", "storage", "analysis", "shared", "popup", "dashboard", "options"]) {
  copyJsDir(dir);
}
cpSync(join(DIST, "content.bundle.js"), join(PKG, "content.bundle.js"));

for (const [dir, files] of [
  ["popup", ["popup.html", "popup.css"]],
  ["dashboard", ["dashboard.html", "dashboard.css"]],
  ["options", ["options.html", "options.css", "about.html", "privacy.html", "cookies.html", "404.html"]],
]) {
  for (const f of files) cpSync(join("src", dir, f), join(PKG, dir, f));
}

mkdirSync(join(PKG, "design", "fonts"), { recursive: true });
cpSync(join("src", "design", "base.css"), join(PKG, "design", "base.css"));
cpSync(join("src", "design", "tokens.css"), join(PKG, "design", "tokens.css"));
cpSync(join("src", "design", "fonts"), join(PKG, "design", "fonts"), { recursive: true });
if (existsSync(join("src", "design", "img"))) {
  cpSync(join("src", "design", "img"), join(PKG, "design", "img"), { recursive: true });
}

// Vendored anime.js ESM bundle, imported by popup/dashboard for motion.
// Kept as a plain local file (not fetched from a CDN) so the extension's
// "script-src 'self'" CSP and local-only design both stay intact.
mkdirSync(join(PKG, "vendor"), { recursive: true });
cpSync(join("src", "vendor", "anime.esm.js"), join(PKG, "vendor", "anime.esm.js"));

cpSync("manifest.json", join(PKG, "manifest.json"));
if (existsSync("icons")) cpSync("icons", join(PKG, "icons"), { recursive: true });

console.log(`\n✓ Build complete → ${PKG}`);
console.log("  Load it via chrome://extensions → Developer mode → Load unpacked");
