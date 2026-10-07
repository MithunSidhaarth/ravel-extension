// RAVEL - content script.
//
// Optional: only registered once the user grants page access in Settings
// (background/serviceWorker.ts syncContentScript). Reads only what
// adapters/genericWebsite.ts documents - one generic reader for every site,
// no per-site DOM scraping to rot when YouTube/Instagram/Netflix redesign.
// Sends two message types to the background worker and nothing else:
// PAGE_OBSERVED (once per navigation) and ACTIVE_TIME_TICK (periodic,
// only while the tab is visible and the user is not idle).

import { genericWebsiteAdapter } from "../adapters/genericWebsite";
import type { RavelMessage } from "../shared/types";
import { domainFromUrl, extractKeywords, platformFor } from "../shared/utils";

const TICK_MS = 5000;
const IDLE_AFTER_MS = 60000;

let lastActivityAt = Date.now();
let currentUrl = "";
let tickTimer: ReturnType<typeof setInterval> | null = null;

function markActive() {
  lastActivityAt = Date.now();
}

function isIdle(): boolean {
  return Date.now() - lastActivityAt > IDLE_AFTER_MS;
}

function send(message: RavelMessage) {
  try {
    chrome.runtime.sendMessage(message);
  } catch {
    // extension context can be invalidated on reload - fail silently
  }
}

function observeCurrentPage(spaNav = false) {
  const url = location.href;
  if (url === currentUrl) return;
  currentUrl = url;

  // After an in-app (pushState) navigation, SPAs rarely update their
  // Open Graph / meta tags - they still describe the FIRST page loaded.
  // Trust only the title then, rather than file this page under the old one.
  const signal = spaNav
    ? { title: document.title, contentType: "page" as const, keywords: extractKeywords(document.title, 8), extraction: { sources: ["title-tag" as const], confidence: 0.1 } }
    : genericWebsiteAdapter.read(document, url);
  if (!signal) return;

  send({
    type: "PAGE_OBSERVED",
    payload: {
      timestamp: Date.now(),
      url,
      domain: domainFromUrl(url),
      title: signal.title,
      platform: platformFor(location.hostname),
      contentType: signal.contentType,
      keywords: signal.keywords,
      meta: signal.meta,
      description: signal.description,
      extraction: signal.extraction,
    },
  });
}

function tick() {
  if (document.visibilityState !== "visible") return;
  if (isIdle()) return;
  send({ type: "ACTIVE_TIME_TICK", payload: { url: currentUrl, deltaMs: TICK_MS } });
}

function start() {
  observeCurrentPage();

  // SPA navigation detection (YouTube/Instagram/Netflix never full-reload).
  const pushState = history.pushState;
  history.pushState = function (...args) {
    pushState.apply(history, args as any);
    setTimeout(() => observeCurrentPage(true), 300); // let the SPA repaint the title
  };
  window.addEventListener("popstate", () => setTimeout(() => observeCurrentPage(true), 300));

  // Idle/active signals.
  ["mousemove", "keydown", "scroll", "click"].forEach((evt) =>
    document.addEventListener(evt, markActive, { passive: true })
  );
  document.addEventListener("visibilitychange", markActive);

  tickTimer = setInterval(tick, TICK_MS);
}

start();
