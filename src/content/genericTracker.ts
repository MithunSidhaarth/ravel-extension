// RAVEL - content script.
//
// Runs in the page. Reads only what the resolved adapter is scoped to
// read (see /src/adapters/*.ts for exactly what each one touches).
// Sends two message types to the background worker and nothing else:
// PAGE_OBSERVED (once per navigation) and ACTIVE_TIME_TICK (periodic,
// only while the tab is visible and the user is not idle).

import { resolveAdapter } from "./platformDetection";
import type { RavelMessage } from "../shared/types";
import { domainFromUrl } from "../shared/utils";

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

function observeCurrentPage() {
  const url = location.href;
  if (url === currentUrl) return;
  currentUrl = url;

  const adapter = resolveAdapter(location.hostname);
  const signal = adapter.read(document, url);
  if (!signal) return;

  send({
    type: "PAGE_OBSERVED",
    payload: {
      timestamp: Date.now(),
      url,
      domain: domainFromUrl(url),
      title: signal.title,
      platform: adapter.platform,
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
    setTimeout(observeCurrentPage, 300); // let the SPA repaint the title/DOM
  };
  window.addEventListener("popstate", () => setTimeout(observeCurrentPage, 300));

  // Idle/active signals.
  ["mousemove", "keydown", "scroll", "click"].forEach((evt) =>
    document.addEventListener(evt, markActive, { passive: true })
  );
  document.addEventListener("visibilitychange", markActive);

  tickTimer = setInterval(tick, TICK_MS);
}

start();
