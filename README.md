<div align="center">

<img src="docs/icon.png" width="96" height="96" alt="Ravel icon" />

# Ravel

**Close any tab without losing your place.**

Ravel groups your open tabs into threads, notices which ones have gone quiet, and lets you close them with the whole thread kept and searchable. Everything stays on your device, and every line of it is free and open source under the MIT licence.

[Website](https://ravel.runs-on.dev) · [Download](https://ravel.runs-on.dev/download) · [Install from source](#build-from-source)

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-9cc4ff?style=flat-square&labelColor=05080e)
![Local only](https://img.shields.io/badge/data-local%20only-9cc4ff?style=flat-square&labelColor=05080e)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-9cc4ff?style=flat-square&labelColor=05080e)
![MIT licence](https://img.shields.io/badge/licence-MIT-9cc4ff?style=flat-square&labelColor=05080e)
![Open source](https://img.shields.io/badge/open%20source-yes-9cc4ff?style=flat-square&labelColor=05080e)

<img src="docs/site.jpg" alt="The Ravel website" width="860" />

</div>

## Why

You're not hoarding tabs. You're keeping a promise to come back to them. Closing a tab feels like losing the thread, so the tabs pile up, and the thread gets lost anyway.

Ravel doesn't organize your tabs. It removes the reason you're afraid to close them.

## Way Back: what makes Ravel different

Other tab tools ask how long it's been since you looked at a tab, or wait for you to dump them. Ravel asks **what closing a tab would cost you**, and keeps the way back to it.

- **Covered, nothing to lose.** The same page is open in another tab, or you've since refined that search ("flights nyc" → "flights nyc jfk march"). These are offered the minute they appear. They don't have to go quiet first.
- **Easy to find again.** A homepage, a search that can be re-run, or a title specific enough to search for. Ravel saves the exact search that gets it back.
- **Hard to find again.** A filtered view whose settings live only in its address, or a title too vague to search for. Ravel saves the address and the page it was opened from.

Quiet threads are suggested cheapest-to-lose first, so the first few closes are painless before a thread with a hard-to-find tab ever comes up. Everything is judged on your device from the address, title, the page a tab was opened from, and how often you visit a site.

## What it does

| | |
|---|---|
| **Open threads** | Every open http(s) tab, grouped by the words and sites they share. No folders, no manual tidying. |
| **Quiet thread nudges** | A thread untouched for a few days (you choose how many) is flagged as safe to close. Tab ages come from the browser itself, so tabs that were already old on install day are flagged on install day. Nothing ever closes automatically. |
| **Ravel it** | One click closes the thread's tabs and keeps a digest of every title, site and time span as a **spool**. |
| **Spools** | Every thread you've ravelled, kept in full and reopenable whenever you need it. |
| **Search** | Find a page by any word from its title, site or address, narrowed by time (*"streeteasy last week"*), and see how you got there. It matches words, not meaning. |
| **Trails** | The rabbit holes you fell into, mapped out as paths you can walk back through. |

<div align="center">
<img src="docs/popup.png" alt="Ravel popup: open threads" width="300" />
&nbsp;
<img src="docs/dashboard-threads.jpg" alt="Dashboard: open threads" width="540" />
<br/><br/>
<img src="docs/dashboard-spools.jpg" alt="Dashboard: spools" width="860" />
</div>

## Privacy by architecture

Ravel needs to see your tabs to group them. It never needs to send them anywhere.

- **No network requests.** The extension has no server to talk to. Grouping, flagging, search and spools all run in the browser.
- **Local storage only.** Everything lives in the browser's IndexedDB. Export it or delete everything from the settings page at any time.
- **Permissions:** `tabs` (to read titles and URLs and close what you ravel), `alarms` (to re-run analysis periodically) and `scripting` (to switch on the optional page reader). That's the whole install-time list: no access to page content.
- **Page access is opt-in.** Settings → *Read page descriptions* asks Chrome for access to http(s) pages. Only then does a content script read a page's description tags and count active reading time. Turn it off and the access is handed back.
- **Fonts are bundled.** Nothing is fetched from a CDN; the pages run under a `script-src 'self'` policy.
- **Open source, so you can check.** Every claim above can be verified by reading `src/`. Nothing is hidden behind a build step you can't reproduce.

## Install

### From the website (easiest)

Ravel isn't on the Chrome Web Store yet.

1. Download the zip from [ravel.runs-on.dev/download](https://ravel.runs-on.dev/download) and unzip it somewhere permanent.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `ravel-extension` folder (the one with `manifest.json` inside).
5. Pin Ravel from the puzzle-piece menu.

### Build from source

Requires Node 20 or newer.

```bash
npm install
npm run build
npm run check   # word-matching self-check
```

Then load the generated `dist_pkg/` folder with **Load unpacked**.

The build does two different things on purpose:

- `tsc` compiles the service worker and the extension pages (popup, dashboard, options) to real ES modules.
- `esbuild` bundles the content script into a single dependency-free IIFE, because content scripts declared in the manifest can't be ES modules.

## Project structure

```
src/
  background/   service worker: the only writer to storage, runs analysis on an alarm
  content/      optional content script: page description and active-time ticks
  adapters/     the one generic page reader (Open Graph, schema.org, meta tags)
  analysis/     topic clustering, stale threads, rabbit holes, search, trace-back
  storage/      IndexedDB schema and repositories
  popup/        the toolbar popup (open threads, search, current page)
  dashboard/    full-page dashboard (home, threads, search, trails, spools)
  options/      settings, plus about, privacy and cookie pages
  design/       tokens, base styles and bundled fonts (Inter Tight, JetBrains Mono)
icons/          extension icons
build.mjs       build script (tsc + esbuild, assembles dist_pkg/)
```

## Design

The interface uses the same ice-blue glass language as the website: a graphite field, one ice accent for anything live or actionable, a deeper cobalt for anything asking for a decision, and sharp glass panels. All colours, radii and type live in `src/design/tokens.css`.

## Open source and licence

Ravel is free and open source under the [MIT licence](LICENSE). Use it, fork it, learn from it, ship your own version of it. Issues and pull requests are welcome.

---

<div align="center">
<sub>Close it. Keep the thread. · A work of <a href="https://mithunsidhaarth.in">Mithun Sidhaarth</a></sub>
</div>
