import type {
  OpenThread,
  RabbitHole,
  RavelSettings,
  SearchResult,
  Spool,
  TopicCluster,
  TraceBackResult,
  RavelBroadcast,
  RavelSnapshot,
  RavelStats,
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import { formatDuration, daysBetween } from "../shared/utils";
import { MOCK_SNAPSHOT } from "../popup/mockData";
import { animate } from "../vendor/anime.esm.js";

const root = document.getElementById("dash-root")!;
const tabs = document.querySelectorAll<HTMLButtonElement>(".topbar-tab");
const statStrip = document.getElementById("stat-strip")!;
const panelTitle = document.getElementById("dash-panel-title")!;
const panelEyebrow = document.getElementById("dash-panel-eyebrow")!;

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------- MOTION ----------------
// Every panel used to just replace the last one instantly. This gives the
// dashboard a consistent choreography: the panel itself crossfades on tab
// switch (playTabSwitch), then whatever landed inside plays its own reveal
// (playTabEntrance) - a trail draws itself, a search result rises in, a
// thread row settles into place. Every animate() call is independent and
// no-ops safely if its target isn't in the current panel.

function playTabEntrance(container: HTMLElement) {
  if (REDUCED_MOTION) return;
  animateHomeCards(container);
  animateSearchSuggestions(container);
  animateTraceFoundCards(container);
  animateTraceChain(container);
  animateHoleRows(container);
  animateThreadRows(container);
}

function animateSearchSuggestions(container: HTMLElement) {
  const chips = Array.from(container.querySelectorAll<HTMLElement>(".search-suggestion-chip"));
  if (chips.length === 0) return;
  animate(chips, {
    opacity: [0, 1],
    translateX: [-8, 0],
    duration: 340,
    delay: (_el: Element, i: number) => 60 + i * 80,
    ease: "outQuart",
  } as Record<string, unknown>);
}

function animateTraceFoundCards(container: HTMLElement) {
  const heading = container.querySelector<HTMLElement>(".search-page-heading");
  const cards = Array.from(container.querySelectorAll<HTMLElement>(".trace-found-card"));
  if (heading) {
    animate(heading, { opacity: [0, 1], translateY: [-4, 0], duration: 300, ease: "outQuad" } as Record<
      string,
      unknown
    >);
  }
  if (cards.length === 0) return;
  animate(cards, {
    opacity: [0, 1],
    translateY: [14, 0],
    duration: 420,
    delay: (_el: Element, i: number) => 80 + i * 100,
    ease: "outQuart",
  } as Record<string, unknown>);
}

// the breadcrumb trail in "trace back" - same idea as a rabbit-hole trail,
// but vertical: each step (and the arrow after it) lands in sequence,
// ending on "YOU FOUND THIS".
function animateTraceChain(container: HTMLElement) {
  const chain = container.querySelector<HTMLElement>(".trace-chain");
  if (!chain) return;
  const items = Array.from(chain.children) as HTMLElement[];
  if (items.length === 0) return;

  // THE PULL: the spine (::before) starts collapsed at the anchor (the
  // found item) and is drawn backward through time as the steps behind
  // it light up - a thread being pulled, not a list fading in.
  chain.style.setProperty("--ravel-thread-progress", "0");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => chain.style.setProperty("--ravel-thread-progress", "1"));
  });

  animate(items, {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 340,
    delay: (_el: Element, i: number) => 90 + i * 90,
    ease: "outQuart",
  } as Record<string, unknown>);
}

// the rabbit-hole trail (● ── ● ── ●), reused at full size for the Trails tab:
// each row rises in, then its own trail draws itself node by node.
function animateHoleRows(container: HTMLElement) {
  const rows = Array.from(container.querySelectorAll<HTMLElement>(".panel-list .hole-row"));
  if (rows.length === 0) return;

  animate(rows, {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 420,
    delay: (_el: Element, i: number) => i * 90,
    ease: "outQuart",
  } as Record<string, unknown>);

  rows.forEach((row, rowIndex) => {
    const trail = row.querySelector<HTMLElement>(".hole-trail");
    if (!trail) return;
    const dots = Array.from(trail.querySelectorAll<HTMLElement>(".hole-dot"));
    const lines = Array.from(trail.querySelectorAll<HTMLElement>(".hole-line"));
    lines.forEach((line) => (line.style.transformOrigin = "left center"));
    const base = 220 + rowIndex * 90; // starts once this row has risen into place

    if (dots.length) {
      animate(dots, {
        scale: [0, 1],
        opacity: [0, 1],
        duration: 320,
        delay: (_el: Element, i: number) => base + i * 90,
        ease: "outBack",
        onComplete: () => dots.forEach((d) => (d.style.transform = "")), // hand back to the :hover rule
      } as Record<string, unknown>);
    }
    if (lines.length) {
      animate(lines, {
        scaleX: [0, 1],
        duration: 180,
        delay: (_el: Element, i: number) => base + i * 90 + 60,
        ease: "outQuad",
      } as Record<string, unknown>);
    }
  });
}

// open-thread rows rise in together, most-stale (most urgent) first, same
// staggered rhythm as everywhere else in the dashboard.
function animateThreadRows(container: HTMLElement) {
  const rows = Array.from(container.querySelectorAll<HTMLElement>(".dash-thread-row"));
  if (rows.length === 0) return;
  animate(rows, {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 380,
    delay: (_el: Element, i: number) => i * 70,
    ease: "outQuart",
  } as Record<string, unknown>);
}

function animateStatStrip() {
  if (REDUCED_MOTION) return;
  const cards = Array.from(statStrip.querySelectorAll<HTMLElement>(".stat-card"));
  const values = Array.from(statStrip.querySelectorAll<HTMLElement>(".stat-value"));
  if (cards.length === 0) return;

  animate(cards, {
    opacity: [0, 1],
    translateY: [-6, 0],
    duration: 340,
    delay: (_el: Element, i: number) => i * 70,
    ease: "outQuad",
  } as Record<string, unknown>);

  // only pure integers count up (sessions, domains, pages) - a duration
  // string like "2h 14m" just rises in with its card, no fake tween.
  values.forEach((valEl, i) => {
    const raw = valEl.textContent ?? "";
    if (!/^\d+$/.test(raw)) return;
    const target = parseInt(raw, 10);
    const counter = { v: 0 };
    valEl.textContent = "0";
    animate(counter, {
      v: target,
      duration: 700,
      delay: 140 + i * 70,
      ease: "outExpo",
      onUpdate: () => {
        valEl.textContent = String(Math.round(counter.v));
      },
    } as Record<string, unknown>);
  });
}

// a quick crossfade between tabs, instead of the panel snapping to the
// new content. The freshly rendered panel's own entrance (playTabEntrance)
// takes over once this lands.
function playTabSwitch(applyTab: () => void) {
  if (REDUCED_MOTION || root.children.length === 0) {
    applyTab();
    return;
  }
  animate(root, {
    opacity: [1, 0],
    translateY: [0, -8],
    duration: 150,
    ease: "inQuad",
    onComplete: () => {
      root.style.opacity = "";
      root.style.transform = "";
      applyTab();
    },
  } as Record<string, unknown>);
}

const TAB_TITLES: Record<string, string> = {
  home: "Ravel",
  threads: "Open Threads",
  search: "Search",
  holes: "Trails",
  spools: "Spools",
};

const TAB_EYEBROWS: Record<string, string> = {
  home: "LOCAL-ONLY · NOTHING LEAVES YOUR DEVICE",
  threads: "CLOSE IT. KEEP THE THREAD.",
  search: "YOUR INTERNET MEMORY",
  holes: "SERIOUS INFO",
  spools: "CLOSED, NOT LOST",
};

let snapshot: RavelSnapshot = MOCK_SNAPSHOT;
let usingMock = true;
let activeTab = "home";
let spools: Spool[] = [];
let openThreads: OpenThread[] = [];
let settings: RavelSettings = DEFAULT_SETTINGS;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function hasAnyData(s: RavelSnapshot): boolean {
  return !!s.now || s.rabbitHoles.length > 0;
}

// ---------------- depth system ----------------
// The shared behavioral rule for time: apply .ravel-depth and set
// --ravel-depth (0 = now, 1 = fully sunk) on any element that shows a
// timestamp, instead of hand-picking opacity per screen. Depth saturates
// around three weeks - old enough to feel buried, not so old it vanishes.
const DEPTH_SATURATION_DAYS = 21;

function applyDepth(target: HTMLElement, timestamp: number) {
  const depth = Math.min(1, daysBetween(Date.now(), timestamp) / DEPTH_SATURATION_DAYS);
  target.classList.add("ravel-depth");
  target.style.setProperty("--ravel-depth", depth.toFixed(3));
}

// confidence readout for a search match - a word, never a percentage
function confidenceLabel(relevance: number): string {
  if (relevance >= 0.72) return "STRONG MATCH";
  if (relevance >= 0.4) return "POSSIBLE MATCH";
  return "WEAK, DISTANT MATCH";
}

// ---------------- open threads (dashboard scale) ----------------
// The full-page version of the popup's core mechanic: every open http(s)
// tab, grouped by topic, with the same "show exactly what stays before
// anything closes" confirm step. Lives here too because closing 5 stale
// threads one at a time from a 380px popup is tedious - the dashboard is
// where you'd actually do a proper clean-up pass.

const openThreadConfirmKeys = new Set<string>();
let ravelAllConfirming = false;

function threadKey(thread: OpenThread): string {
  return thread.tabs.map((t) => t.tabId).sort((a, b) => a - b).join(",");
}

function fmtQuiet(days: number): string {
  if (days < 1) return "active in the last day";
  if (days < 2) return "quiet for 1 day";
  return `quiet for ${Math.round(days)} days`;
}

function renderOpenThreads(threads: OpenThread[]) {
  const wrap = el("div");

  const totalTabs = threads.reduce((sum, t) => sum + t.tabs.length, 0);
  const intro = el(
    "div",
    "panel-intro",
    totalTabs > 0
      ? `${totalTabs} open tab${totalTabs === 1 ? "" : "s"} across ${threads.length} thread${threads.length === 1 ? "" : "s"}. Stale ones are flagged. Ravel one to close its tabs and keep a digest.`
      : "No open tabs tracked yet. Ravel watches http/https tabs as you browse."
  );
  wrap.append(intro);

  const staleThreads = threads.filter((t) => t.isStale);
  if (staleThreads.length > 0) {
    const staleTabCount = staleThreads.reduce((sum, t) => sum + t.tabs.length, 0);
    const bar = el("div", "dash-ravel-all-bar");
    const allBtn = el(
      "button",
      "dash-ravel-all-btn",
      `RAVEL ALL STALE (${staleThreads.length})`
    );
    allBtn.addEventListener("click", () => {
      ravelAllConfirming = !ravelAllConfirming;
      render();
    });
    bar.append(allBtn);
    wrap.append(bar);

    if (ravelAllConfirming) {
      wrap.append(renderRavelAllConfirm(staleThreads, staleTabCount));
    }
  }

  const list = el("div", "panel-list");
  if (threads.length === 0) {
    list.append(el("div", "panel-empty", "Nothing open to show yet."));
  }

  threads.forEach((thread) => {
    const key = threadKey(thread);
    const row = el("div", `dash-thread-row${thread.isStale ? " is-stale" : ""}`);
    row.dataset.key = key;

    const main = el("div", "dash-thread-main");
    main.append(el("span", "dash-thread-dot"));

    const text = el("div", "dash-thread-text");
    text.append(el("div", "dash-thread-label", thread.label));
    const tabWord = thread.tabs.length === 1 ? "1 tab" : `${thread.tabs.length} tabs`;
    const domains = [...new Set(thread.tabs.map((t) => t.domain))].slice(0, 3).join(", ");
    text.append(el("div", "dash-thread-meta", `${tabWord} · ${fmtQuiet(thread.quietDays)} · ${domains}`));
    main.append(text);

    const button = el("button", "dash-thread-btn", thread.isStale ? "RAVEL IT" : "RAVEL");
    button.addEventListener("click", () => {
      if (openThreadConfirmKeys.has(key)) openThreadConfirmKeys.delete(key);
      else openThreadConfirmKeys.add(key);
      render();
    });
    main.append(button);
    row.append(main);

    if (openThreadConfirmKeys.has(key)) {
      row.append(renderThreadConfirm(thread, key));
    }

    list.append(row);
  });

  wrap.append(list);
  root.append(wrap);
}

function renderThreadConfirm(thread: OpenThread, key: string): HTMLElement {
  const panel = el("div", "dash-thread-confirm");
  const domains = [...new Set(thread.tabs.map((t) => t.domain))];
  const span =
    thread.tabs.length > 1
      ? `${thread.tabs.length} tabs across ${domains.length} site${domains.length === 1 ? "" : "s"}`
      : `1 tab on ${domains[0] ?? "unknown"}`;
  panel.append(
    el(
      "div",
      "dash-thread-confirm-digest",
      `This is what stays after closing: ${span}. Every title and site below is kept, searchable, in your Spools.`
    )
  );

  const tabsList = el("div", "dash-thread-confirm-tabs");
  thread.tabs.forEach((t) =>
    tabsList.append(el("div", "dash-thread-confirm-tab", `${t.title || t.domain} · ${t.domain}`))
  );
  panel.append(tabsList);

  const actions = el("div", "dash-thread-confirm-actions");
  const confirmBtn = el("button", "dash-thread-confirm-btn primary", "CLOSE & REMEMBER");
  confirmBtn.addEventListener("click", () => ravelThread(thread, key));
  const cancelBtn = el("button", "dash-thread-confirm-btn ghost", "NEVER MIND");
  cancelBtn.addEventListener("click", () => {
    openThreadConfirmKeys.delete(key);
    render();
  });
  actions.append(confirmBtn, cancelBtn);
  panel.append(actions);

  return panel;
}

async function ravelThread(thread: OpenThread, key: string) {
  openThreadConfirmKeys.delete(key);
  try {
    const result: Spool | { error: string } = await chrome.runtime.sendMessage({
      type: "RAVEL_THREAD",
      payload: { tabIds: thread.tabs.map((t) => t.tabId), label: thread.label, keywords: thread.keywords },
    });
    if (!("error" in result) && activeTab === "spools") await loadSpools();
  } catch {
    // background unreachable - the row simply won't update; nothing was lost
  }
}

// Same "show what stays before closing" confirm as a single thread, just
// listing every stale thread instead of one. Ravels them one at a time
// through the existing message, so a failure on one doesn't stop the rest.
function renderRavelAllConfirm(staleThreads: OpenThread[], staleTabCount: number): HTMLElement {
  const panel = el("div", "dash-thread-confirm");
  panel.append(
    el(
      "div",
      "dash-thread-confirm-digest",
      `This closes ${staleThreads.length} stale thread${staleThreads.length === 1 ? "" : "s"} (${staleTabCount} tab${staleTabCount === 1 ? "" : "s"}). Every title and site is kept, searchable, in your Spools.`
    )
  );

  const list = el("div", "dash-thread-confirm-tabs");
  staleThreads.forEach((t) => list.append(el("div", "dash-thread-confirm-tab", t.label)));
  panel.append(list);

  const actions = el("div", "dash-thread-confirm-actions");
  const confirmBtn = el("button", "dash-thread-confirm-btn primary", "CLOSE & REMEMBER ALL");
  confirmBtn.addEventListener("click", () => ravelAllStale(staleThreads));
  const cancelBtn = el("button", "dash-thread-confirm-btn ghost", "NEVER MIND");
  cancelBtn.addEventListener("click", () => {
    ravelAllConfirming = false;
    render();
  });
  actions.append(confirmBtn, cancelBtn);
  panel.append(actions);

  return panel;
}

async function ravelAllStale(staleThreads: OpenThread[]) {
  ravelAllConfirming = false;
  for (const thread of staleThreads) {
    await ravelThread(thread, threadKey(thread));
  }
  await loadOpenThreads();
}

async function loadOpenThreads() {
  try {
    const threads: OpenThread[] = await chrome.runtime.sendMessage({ type: "GET_OPEN_THREADS" });
    openThreads = threads ?? [];
    if (activeTab === "threads") render();
  } catch {
    // background not reachable - keep whatever's already shown
  }
}

// ---------------- search - "find anything you've fallen into" ----------------

let searchQuery = "";
let searchResults: SearchResult[] | null = null; // null = no search run yet
let searchRunning = false;
let traceResult: TraceBackResult | null = null;
let traceLoading: string | null = null; // eventId currently being traced

// the search box doesn't wait with static copy - the placeholder itself
// cycles through the shape of an imperfect memory, since the person
// typing isn't searching the internet, they're trying to recall something
const SEARCH_PLACEHOLDERS = [
  "Describe anything you remember…",
  "I remember something about…",
  "It was around…",
  "I found it after…",
  "It looked like…",
];
let placeholderIndex = 0;

function cycleSearchPlaceholder() {
  const input = document.querySelector<HTMLInputElement>(".search-page-input");
  if (!input || document.activeElement === input || input.value) return;
  placeholderIndex = (placeholderIndex + 1) % SEARCH_PLACEHOLDERS.length;
  input.classList.remove("is-cycling");
  void input.offsetWidth; // restart the CSS transition
  input.placeholder = SEARCH_PLACEHOLDERS[placeholderIndex];
  input.classList.add("is-cycling");
}

const SEARCH_SUGGESTIONS = [
  "that AI website I saw at night",
  "the video I watched a few weeks ago",
  "something about an AI operating system",
  "the GitHub repo after that YouTube video",
];

function fmtAgoLong(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function reasonLine(r: SearchResult): string | null {
  const topic = r.reasons.find((x) => x.kind === "topic");
  if (topic?.kind === "topic")
    return r.rabbitHole
      ? `You visited it during a trail through ${r.rabbitHole.trail.map((s) => s.title || s.domain).slice(0, 3).join(" → ")}`
      : `You visited it while exploring ${topic.label}`;
  const keywords = r.reasons.filter((x) => x.kind === "keyword").map((x) => (x.kind === "keyword" ? x.keyword : ""));
  if (keywords.length > 0) return `It matched: ${keywords.slice(0, 4).join(", ")}`;
  const platform = r.reasons.find((x) => x.kind === "platform");
  if (platform?.kind === "platform") return `Found on ${platform.platform}`;
  const time = r.reasons.find((x) => x.kind === "time");
  if (time?.kind === "time") return `It matches the timeframe: ${time.text}`;
  const title = r.reasons.find((x) => x.kind === "title");
  if (title?.kind === "title") return `The title matched what you described`;
  const url = r.reasons.find((x) => x.kind === "url");
  if (url?.kind === "url") return `The URL matched what you described`;
  return null;
}

async function runSearch(query: string) {
  searchQuery = query;
  if (!query.trim()) {
    searchResults = null;
    render();
    return;
  }
  searchRunning = true;
  render();
  try {
    const results: SearchResult[] = await chrome.runtime.sendMessage({
      type: "SEARCH_MEMORY",
      payload: { query, limit: 10 },
    });
    searchResults = results ?? [];
  } catch {
    searchResults = [];
  }
  searchRunning = false;
  render();
}

async function openTraceBack(eventId: string) {
  traceLoading = eventId;
  render();
  try {
    traceResult = await chrome.runtime.sendMessage({ type: "TRACE_BACK", payload: { eventId } });
  } catch {
    traceResult = null;
  }
  traceLoading = null;
  render();
}

function closeTraceBack() {
  traceResult = null;
  render();
}

function renderSearchTab() {
  const wrap = el("div", "search-page");

  // ---- the search itself ----
  const hero = el("div", "search-page-hero");
  hero.append(el("div", "search-page-label", "WHAT ARE YOU TRYING TO REMEMBER?"));

  const box = el("div", "search-page-box");
  const icon = el("span", "search-page-icon");
  icon.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="7" cy="7" r="5.1" stroke="currentColor" stroke-width="1.1"/>' +
    '<line x1="10.8" y1="10.8" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
    "</svg>";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "search-page-input";
  input.placeholder = SEARCH_PLACEHOLDERS[placeholderIndex];
  input.value = searchQuery;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch(input.value);
  });
  box.append(icon, input);
  hero.append(box);
  wrap.append(hero);

  if (traceResult) {
    wrap.append(renderTraceView(traceResult));
    root.append(wrap);
    return;
  }

  if (traceLoading) {
    wrap.append(el("div", "search-status", "Retracing your steps…"));
    root.append(wrap);
    return;
  }

  if (searchRunning) {
    wrap.append(el("div", "search-status", "Searching your local activity…"));
    root.append(wrap);
    return;
  }

  if (searchResults === null) {
    if (usingMock) {
      wrap.append(el("div", "preview-badge", "PREVIEW: SHOWN BEFORE RAVEL HAS DATA OF YOUR OWN"));
    }
    const suggestions = el("div", "search-suggestions");
    suggestions.append(el("div", "search-suggestions-label", "TRY SOMETHING LIKE"));
    SEARCH_SUGGESTIONS.forEach((s) => {
      const chip = el("button", "search-suggestion-chip", s);
      chip.addEventListener("click", () => {
        input.value = s;
        runSearch(s);
      });
      suggestions.append(chip);
    });
    wrap.append(suggestions);
    root.append(wrap);
    return;
  }

  if (searchResults.length === 0) {
    const empty = el("div", "search-empty");
    empty.append(el("div", "search-empty-headline", "Nothing surfaced."));
    empty.append(
      el(
        "div",
        "search-empty-hint",
        "RAVEL only searches what it's actually seen you visit. Try remembering what came before it, or describe a different timeframe."
      )
    );
    wrap.append(empty);
    root.append(wrap);
    return;
  }

  // "the first found memory" - the very first successful search of the
  // session gets one beat of its own before settling into the list.
  if (!sessionStorage.getItem("ravel_found_moment_played")) {
    sessionStorage.setItem("ravel_found_moment_played", "1");
    wrap.append(el("div", "found-moment", "FOUND."));
  }

  const heading = el(
    "div",
    "search-page-heading",
    `I FOUND ${searchResults.length} POSSIBLE TRACE${searchResults.length === 1 ? "" : "S"}`
  );
  wrap.append(heading);

  const list = el("div", "trace-found-list");
  searchResults.forEach((r, i) => {
    const card = el("div", i === 0 ? "trace-found-card is-most-likely" : "trace-found-card");
    // confidence drives how "distant" a weaker match looks - read from
    // the real ranking score (SearchResult.relevance), not invented.
    card.style.setProperty("--ravel-confidence", r.relevance.toFixed(3));
    if (i === 0) {
      card.append(el("div", "trace-found-tag", "MOST LIKELY"));
    } else {
      card.append(el("div", "trace-found-confidence", confidenceLabel(r.relevance)));
    }

    card.append(el("div", "trace-found-title", r.event.title || r.event.domain));
    card.append(el("div", "trace-found-sub", "You visited this:"));
    const metaLine = el(
      "div",
      "trace-found-meta",
      `${fmtAgoLong(r.event.timestamp)} · ${fmtClock(r.event.timestamp)} · ${r.event.domain}`
    );
    applyDepth(metaLine, r.event.timestamp);
    card.append(metaLine);

    const reason = reasonLine(r);
    if (reason) {
      card.append(el("div", "trace-found-why-label", "Why this may be it:"));
      card.append(el("div", "trace-found-why", reason));
    }

    const actions = el("div", "trace-found-actions");
    const openBtn = el("button", "trace-found-btn", "OPEN");
    openBtn.addEventListener("click", () => chrome.tabs.create({ url: r.event.url }));
    const traceBtn = el("button", "trace-found-btn trace-found-btn-ghost", "TRACE BACK");
    traceBtn.addEventListener("click", () => openTraceBack(r.event.id));
    actions.append(openBtn, traceBtn);
    card.append(actions);

    list.append(card);
  });
  wrap.append(list);

  root.append(wrap);
}

function renderTraceView(trace: TraceBackResult): HTMLElement {
  const view = el("div", "trace-view");

  const back = el("button", "trace-view-back", "‹ Back to results");
  back.addEventListener("click", closeTraceBack);
  view.append(back);

  if (trace.rabbitHoleLabel) {
    view.append(el("div", "trace-view-hole", `Part of a trail through ${trace.rabbitHoleLabel}`));
  }

  const chain = el("div", "trace-chain");

  if (trace.steps.length === 0) {
    chain.append(
      el(
        "div",
        "trace-chain-empty",
        "No earlier activity in this session. This was likely a fresh visit (a new tab, a bookmark, or a link from outside the browser)."
      )
    );
  }

  trace.steps.forEach((step) => {
    const row = el("div", "trace-chain-step");
    const timeEl = el("div", "trace-chain-time", fmtClock(step.timestamp));
    applyDepth(timeEl, step.timestamp);
    row.append(timeEl);
    const body = el("div", "trace-chain-body");
    body.append(el("div", "trace-chain-title", step.title || step.domain));
    body.append(el("div", "trace-chain-domain", step.domain));
    row.append(body);
    chain.append(row);
    chain.append(el("div", "trace-chain-arrow", "↓"));
  });

  const targetRow = el("div", "trace-chain-step trace-chain-target");
  targetRow.append(el("div", "trace-chain-time", fmtClock(trace.target.timestamp)));
  const targetBody = el("div", "trace-chain-body");
  targetBody.append(el("div", "trace-chain-title", "YOU FOUND THIS"));
  targetBody.append(
    el("div", "trace-chain-domain", `${trace.target.title || trace.target.domain} · ${trace.target.domain}`)
  );
  targetRow.append(targetBody);
  chain.append(targetRow);

  view.append(chain);
  return view;
}

// ---------------- stat strip ----------------

function renderStats(stats: RavelStats | null) {
  statStrip.innerHTML = "";
  const cards: Array<[string, string]> = stats
    ? [
        [formatDuration(stats.activeTodayMs), "ACTIVE TODAY"],
        [String(stats.sessionsToday), "SESSIONS TODAY"],
        [String(stats.domainsTracked), "DOMAINS SEEN"],
        [String(stats.eventsTracked), "PAGES LOGGED"],
      ]
    : [["·", "ACTIVE TODAY"], ["·", "SESSIONS TODAY"], ["·", "DOMAINS SEEN"], ["·", "PAGES LOGGED"]];

  for (const [value, label] of cards) {
    const card = el("div", "stat-card");
    const v = el("div", "stat-value");
    v.textContent = value;
    const l = el("div", "stat-label");
    l.textContent = label;
    card.append(v, l);
    statStrip.append(card);
  }

  animateStatStrip();
}

// ---------------- rabbit holes ----------------

function renderRabbitHoles(holes: RabbitHole[]) {
  const wrap = el("div");
  if (usingMock) {
    const badge = el("div", "preview-badge");
    badge.textContent = "PREVIEW: SHOWN BEFORE RAVEL HAS DATA OF YOUR OWN";
    wrap.append(badge);
  }

  const list = el("div", "panel-list");
  if (holes.length === 0) {
    const empty = el("div", "panel-empty");
    empty.textContent = "No deep trails detected yet. Rabbit holes surface once you move quickly through several connected pages.";
    list.append(empty);
  }

  for (const hole of holes) {
    const row = el("div", "hole-row");
    row.setAttribute("aria-expanded", "false");

    const head = el("button", "hole-head");
    const headText = el("div");
    const title = el("div", "hole-title");
    title.textContent = hole.label;
    const meta = el("div", "hole-meta");
    meta.textContent = `${formatDuration(hole.duration)} · ${hole.eventIds.length} pieces of content`;
    applyDepth(meta, hole.endTime);
    headText.append(title, meta);
    head.append(headText);
    head.addEventListener("click", () => {
      const expanded = row.getAttribute("aria-expanded") === "true";
      row.setAttribute("aria-expanded", String(!expanded));
    });
    row.append(head);

    // "THE LONG RABBIT HOLE" - a trail that ran long doesn't just say so
    // in the meta line, it visibly stretches: longer sessions get wider
    // gaps between stops and a brighter path, so the length is something
    // you see before you read it. Scaled off the real duration, capped
    // so a multi-hour hole doesn't blow out the layout.
    const LONG_HOLE_MS = 40 * 60 * 1000;
    const stretch = Math.min(1, hole.duration / (2 * 60 * 60 * 1000)); // 0..1, saturates at 2h
    const isLong = hole.duration >= LONG_HOLE_MS;

    // the trail itself: a physical path, always visible - nodes are the
    // stops, the connecting line is the path between them.
    const trail = el("div", isLong ? "hole-trail hole-trail-long" : "hole-trail");
    trail.style.setProperty("--ravel-stretch", stretch.toFixed(3));
    hole.trail.forEach((s, i) => {
      if (i > 0) trail.append(el("div", "hole-line"));
      const node = el("div", "hole-node");
      node.title = `${s.title || s.id}${s.domain ? " · " + s.domain : ""}`;
      const dot = el("span", "hole-dot");
      node.append(dot);
      trail.append(node);
    });
    row.append(trail);

    if (isLong) {
      row.append(el("div", "hole-long-caption", `${formatDuration(hole.duration)}, in one motion`));
    }

    // "THE DEAD END" - a trail is a completed session, not an ongoing
    // list: it stopped somewhere, and the row says so quietly rather
    // than trailing off into nothing.
    row.append(el("div", "hole-end-marker", "This is where you left it."));

    // expanded detail: the same stops, named, once the trail is opened
    const detail = el("div", "hole-detail");
    hole.trail.forEach((s) => {
      const step = el("div", "hole-step");
      step.append(document.createTextNode(s.title || s.id));
      const domain = el("span", "hole-step-domain");
      domain.textContent = s.domain || "";
      step.append(domain);
      detail.append(step);
    });
    row.append(detail);

    list.append(row);
  }

  wrap.append(list);
  root.append(wrap);
}

// ---------------- spools ----------------
// A spool is the whole reason ravelling a thread is safe: the tabs are
// gone, this is what stayed. Newest first, nothing summarized away - every
// kept title and site is still right here, and still opens for real.

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function computeWeeklyDigest(list: Spool[]): { threads: number; tabs: number } {
  const cutoff = Date.now() - WEEK_MS;
  const recent = list.filter((s) => s.closedAt >= cutoff);
  return { threads: recent.length, tabs: recent.reduce((sum, s) => sum + s.tabs.length, 0) };
}

function renderWeeklyDigest(list: Spool[]): HTMLElement {
  const { threads, tabs } = computeWeeklyDigest(list);
  const banner = el("div", "spool-week-digest");
  const threadStat = el("div", "spool-week-stat");
  threadStat.append(el("b", undefined, String(threads)), el("span", undefined, `THREAD${threads === 1 ? "" : "S"} RAVELLED THIS WEEK`));
  const tabStat = el("div", "spool-week-stat");
  tabStat.append(el("b", undefined, String(tabs)), el("span", undefined, `TAB${tabs === 1 ? "" : "S"} CLOSED`));
  banner.append(threadStat, tabStat);
  return banner;
}

async function reopenAllTabs(spool: Spool, button: HTMLButtonElement) {
  button.disabled = true;
  button.textContent = "OPENING…";
  for (const t of spool.tabs) {
    try {
      await chrome.tabs.create({ url: t.url, active: false });
    } catch {
      // one tab failing to open shouldn't stop the rest
    }
  }
  button.disabled = false;
  button.textContent = "REOPEN ALL";
}

function renderSpools(list: Spool[]) {
  const wrap = el("div");

  const intro = el(
    "div",
    "panel-intro",
    "Every thread you've ravelled, closed on purpose, kept in full. Nothing here was summarized away."
  );
  wrap.append(intro);

  if (list.length > 0) wrap.append(renderWeeklyDigest(list));

  const panelList = el("div", "panel-list");
  if (list.length === 0) {
    const empty = el("div", "panel-empty");
    empty.textContent = "Nothing ravelled yet. When a thread on Open Threads goes stale, ravel it to keep the digest and close the tabs.";
    panelList.append(empty);
  }

  list.forEach((spool, i) => {
    const entry = el("div", "spool-entry");
    entry.style.animationDelay = `${i * 80}ms`;

    const head = el("div", "spool-head");
    const title = el("div", "spool-title", spool.label);
    head.append(title);
    const closedAt = el("div", "spool-closed-at", fmtDateTime(spool.closedAt));
    head.append(closedAt);
    entry.append(head);

    const digest = el("div", "spool-digest", spool.digest);
    entry.append(digest);

    const tabList = el("div", "spool-tabs");
    spool.tabs.forEach((t) => {
      const row = el("a", "spool-tab-row");
      row.href = t.url;
      row.target = "_blank";
      row.rel = "noreferrer";
      row.append(el("span", "spool-tab-title", t.title || t.domain));
      row.append(el("span", "spool-tab-domain", t.domain));
      tabList.append(row);
    });
    entry.append(tabList);

    const actions = el("div", "spool-actions");
    const reopenBtn = el("button", "spool-reopen-btn", "REOPEN ALL") as HTMLButtonElement;
    reopenBtn.addEventListener("click", () => reopenAllTabs(spool, reopenBtn));
    const deleteBtn = el("button", "spool-delete-btn", "DELETE");
    deleteBtn.addEventListener("click", async () => {
      entry.classList.add("is-removing");
      try {
        await chrome.runtime.sendMessage({ type: "DELETE_SPOOL", payload: { id: spool.id } });
      } catch {
        // background unreachable - leave it, next load will still show it
      }
      spools = spools.filter((s) => s.id !== spool.id);
      if (activeTab === "spools") render();
    });
    actions.append(reopenBtn, deleteBtn);
    entry.append(actions);

    panelList.append(entry);
  });

  wrap.append(panelList);
  root.append(wrap);
}

// ---------------- home ----------------
// The front door: what Ravel is, how it works, and a way into every other
// tab that reads as an invitation rather than a nav bar repeated twice.
// Static copy only, no data loads of its own - see HOME_CARDS below.

const HOME_ICONS: Record<string, string> = {
  threads:
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="5" cy="10" r="2.4" stroke="currentColor" stroke-width="1.1"/>' +
    '<circle cx="15" cy="10" r="2.4" stroke="currentColor" stroke-width="1.1"/>' +
    '<path d="M7.4 10H12.6" stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.6 1.8"/></svg>',
  search:
    '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="7" cy="7" r="5.1" stroke="currentColor" stroke-width="1.1"/>' +
    '<line x1="10.8" y1="10.8" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
  holes:
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="4" cy="16" r="1.6" fill="currentColor"/>' +
    '<circle cx="10" cy="11" r="1.6" fill="currentColor"/>' +
    '<circle cx="16" cy="4" r="1.6" fill="currentColor"/>' +
    '<path d="M5.2 14.8 8.8 12.2M11.2 9.8 14.8 5.2" stroke="currentColor" stroke-width="1"/></svg>',
  spools:
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="4" y="3" width="12" height="14" rx="1" stroke="currentColor" stroke-width="1.1"/>' +
    '<path d="M6.5 7H13.5M6.5 10H13.5M6.5 13H11" stroke="currentColor" stroke-width="1"/></svg>',
  settings:
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="10" cy="10" r="2.6" stroke="currentColor" stroke-width="1.1"/>' +
    '<path d="M10 3v2.2M10 14.8V17M17 10h-2.2M5.2 10H3M14.9 5.1l-1.55 1.55M6.65 13.35 5.1 14.9M14.9 14.9l-1.55-1.55M6.65 6.65 5.1 5.1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
};

type HomeCard = {
  icon: keyof typeof HOME_ICONS;
  tag: string;
  title: string;
  body: string;
  action: () => void;
};

// Static copy, not live counts: the extra data loads and cross-tab render
// triggers a "N threads" stat would need aren't worth it for one line of
// text on an informational page - see ponytail rung 1 (does this need to
// exist at all?).
const HOME_CARDS: HomeCard[] = [
  {
    icon: "threads",
    tag: "Open Threads",
    title: "See what's still open",
    body: "Every live thread across your tabs, grouped by topic, with the stale ones flagged and ready to ravel.",
    action: () => setActiveTab("threads"),
  },
  {
    icon: "search",
    tag: "Search",
    title: "Find anything you remember",
    body: "Describe it however it comes back to you. Ravel finds it and traces back exactly how you got there.",
    action: () => setActiveTab("search"),
  },
  {
    icon: "holes",
    tag: "Trails",
    title: "Your deep rabbit holes",
    body: "Sessions where one thing led to another, mapped out as a path you can walk back through.",
    action: () => setActiveTab("holes"),
  },
  {
    icon: "spools",
    tag: "Spools",
    title: "What you've already closed",
    body: "Every thread you've ravelled, closed on purpose, kept in full, and still searchable.",
    action: () => setActiveTab("spools"),
  },
  {
    icon: "settings",
    tag: "Settings",
    title: "Control what's remembered",
    body: "Decide what Ravel tracks, and for how long it holds onto it.",
    action: () => chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") }),
  },
];

// A plain "hello" reads the same at 8am and 11pm - a time-aware greeting
// is a small, free signal that this is live, not a static screen.
function greeting(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function renderHome() {
  const wrap = el("div", "home-page");

  // ---- hero: what Ravel is, in one breath ----
  const hero = el("div", "home-hero");

  if (settings.userName) {
    hero.append(
      el("div", "home-greeting", `${greeting(new Date().getHours())}, ${settings.userName}.`)
    );
  } else {
    hero.append(renderNamePrompt());
  }

  hero.append(el("div", "home-hero-label", "WHAT RAVEL IS"));
  hero.append(
    el(
      "h2",
      "home-hero-title",
      "Close a tab without losing your place."
    )
  );
  hero.append(
    el(
      "p",
      "home-hero-lede",
      "Ravel quietly follows what you're actually browsing, groups it into living threads, and lets you close the stale ones in one motion. The digest stays, searchable, for as long as you need it. Every trace, every spool, every trail is written only to this device. Nothing is sent anywhere, ever."
    )
  );
  wrap.append(hero);

  // ---- how it works: three steps, the whole mechanic in one glance ----
  const steps = el("div", "home-steps");
  const stepsData: [string, string, string][] = [
    ["01", "TRACK", "Browse normally. Ravel follows what you open in the background, entirely on-device, and groups related tabs into a thread."],
    ["02", "RAVEL IT", "When a thread's gone quiet, close it in one motion. Every tab it held is kept as a spool, a searchable digest, not a summary that throws detail away."],
    ["03", "RECALL", "Half-remember something days later? Describe it in Search and Ravel traces back exactly how you got there."],
  ];
  stepsData.forEach(([num, label, body]) => {
    const step = el("div", "home-step");
    step.append(el("div", "home-step-num", num));
    const text = el("div", "home-step-text");
    text.append(el("div", "home-step-label", label));
    text.append(el("div", "home-step-body", body));
    step.append(text);
    steps.append(step);
  });
  wrap.append(steps);

  // ---- go there: every other tab, as an invitation, not a menu ----
  const nav = el("div", "home-nav");
  nav.append(el("div", "home-nav-label", "GO THERE"));

  const grid = el("div", "home-nav-grid");
  HOME_CARDS.forEach((card) => {
    const tile = el("button", "home-nav-card");
    const iconEl = el("span", "home-nav-icon");
    iconEl.innerHTML = HOME_ICONS[card.icon];
    tile.append(iconEl);
    tile.append(el("span", "home-nav-tag", card.tag));
    tile.append(el("span", "home-nav-title", card.title));
    tile.append(el("span", "home-nav-body", card.body));
    tile.append(el("span", "home-nav-open", "Open →"));
    tile.addEventListener("click", card.action);
    grid.append(tile);
  });
  nav.append(grid);
  wrap.append(nav);

  root.append(wrap);
}

// First-run only: settings.userName starts empty, so Home asks once,
// inline, no modal. Skippable by just not typing anything, ever.
function renderNamePrompt(): HTMLElement {
  const row = el("form", "home-name-prompt");
  row.append(el("span", "home-name-prompt-label", "What should Ravel call you?"));
  const input = document.createElement("input");
  input.type = "text";
  input.className = "home-name-prompt-input";
  input.placeholder = "Your name";
  input.maxLength = 40;
  row.append(input);
  const saveBtn = el("button", "home-name-prompt-btn", "SAVE");
  saveBtn.type = "submit";
  row.append(saveBtn);

  row.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    saveUserName(name);
  });

  return row;
}

async function saveUserName(name: string) {
  try {
    settings = await chrome.runtime.sendMessage({ type: "SET_SETTINGS", payload: { userName: name } });
  } catch {
    settings = { ...settings, userName: name }; // background unreachable - still reflect it locally
  }
  if (activeTab === "home") render();
}

function animateHomeCards(container: HTMLElement) {
  const hero = container.querySelector<HTMLElement>(".home-hero");
  if (hero) {
    animate(hero, { opacity: [0, 1], translateY: [10, 0], duration: 420, ease: "outQuart" } as Record<
      string,
      unknown
    >);
  }
  const stepEls = Array.from(container.querySelectorAll<HTMLElement>(".home-step"));
  if (stepEls.length) {
    animate(stepEls, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 380,
      delay: (_el: Element, i: number) => 160 + i * 90,
      ease: "outQuart",
    } as Record<string, unknown>);
  }
  const cards = Array.from(container.querySelectorAll<HTMLElement>(".home-nav-card"));
  if (cards.length) {
    animate(cards, {
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 420,
      delay: (_el: Element, i: number) => 380 + i * 80,
      ease: "outQuart",
    } as Record<string, unknown>);
  }
}

function render() {
  root.innerHTML = "";
  panelTitle.textContent = TAB_TITLES[activeTab] ?? "Ravel";
  panelEyebrow.textContent = TAB_EYEBROWS[activeTab] ?? "LOCAL-ONLY · NOTHING LEAVES YOUR DEVICE";
  if (activeTab === "home") renderHome();
  if (activeTab === "threads") renderOpenThreads(openThreads);
  if (activeTab === "search") renderSearchTab();
  if (activeTab === "holes") renderRabbitHoles(snapshot.rabbitHoles);
  if (activeTab === "spools") renderSpools(spools);
  playTabEntrance(root);
}

function setActiveTab(tabId: string) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabId));
  playTabSwitch(() => {
    activeTab = tabId;
    render();
    if (activeTab === "spools") loadSpools();
    if (activeTab === "threads") loadOpenThreads();
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab!));
});

document.getElementById("settings-link")?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") });
});

// ---------------- custom cursor ----------------
// Only on a fine pointer (never touch), and only once movement is actually
// observed - avoids a stray dot painted at 0,0 before the first mousemove.

function initCustomCursor() {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  const cursor = document.getElementById("ravel-cursor");
  if (!cursor) return;

  let armed = false;
  document.addEventListener("mousemove", (e) => {
    if (!armed) {
      armed = true;
      document.documentElement.classList.add("ravel-custom-cursor");
    }
    cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  });

  document.addEventListener("mouseover", (e) => {
    const target = e.target as HTMLElement;
    const interactive = target.closest("button, a, input, select, [role='button']");
    cursor.classList.toggle("is-hovering", !!interactive);
  });

  document.addEventListener("mouseleave", () => {
    cursor.style.transform = "translate(-100px, -100px)";
  });
}

initCustomCursor();
setInterval(cycleSearchPlaceholder, 3400);

// ---------------- the field ----------------
// RAVEL's ambient backdrop: points drifting at different depths - near
// ones bright, large, quick; far ones dim, small, slow. Pure decoration,
// but it's what makes the surface feel like a place you're looking INTO
// rather than a flat page.

function initRavelField() {
  if (REDUCED_MOTION) return;
  const canvas = document.getElementById("ravel-field") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let mouseX = 0.5;
  let mouseY = 0.5;

  const c = canvas;
  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX / w;
    mouseY = e.clientY / h;
  });

  const COUNT = 90;
  const points = Array.from({ length: COUNT }, () => {
    const depth = Math.random(); // 0 = near/now, 1 = far/old - same language as .ravel-depth
    return {
      x: Math.random(),
      y: Math.random(),
      depth,
      r: 0.4 + (1 - depth) * 1.6,
      speed: 0.00006 + (1 - depth) * 0.00022,
      phase: Math.random() * Math.PI * 2,
    };
  });

  function frame() {
    ctx!.clearRect(0, 0, w, h);
    for (const p of points) {
      p.phase += p.speed * 16;
      // parallax: nearer points drift further with the cursor
      const px = ((p.x + Math.sin(p.phase) * 0.01 + (mouseX - 0.5) * 0.02 * (1 - p.depth)) % 1 + 1) % 1;
      const py = ((p.y + Math.cos(p.phase * 0.7) * 0.008 + (mouseY - 0.5) * 0.02 * (1 - p.depth)) % 1 + 1) % 1;
      const alpha = 0.06 + (1 - p.depth) * 0.5;
      ctx!.beginPath();
      ctx!.fillStyle = p.depth < 0.18 ? `rgba(217,122,77,${alpha})` : `rgba(245,236,221,${alpha})`;
      ctx!.arc(px * w, py * h, p.r, 0, Math.PI * 2);
      ctx!.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

initRavelField();

chrome.runtime.onMessage.addListener((message: RavelBroadcast) => {
  if (message.type === "SNAPSHOT_UPDATED" && hasAnyData(message.snapshot)) {
    snapshot = message.snapshot;
    usingMock = false;
    render();
  }
  if (message.type === "OPEN_THREADS_UPDATED") {
    openThreads = message.threads;
    if (activeTab === "threads") render();
  }
});

async function loadStats() {
  try {
    const stats: RavelStats = await chrome.runtime.sendMessage({ type: "GET_STATS" });
    renderStats(stats);
  } catch {
    renderStats(null);
  }
}

async function loadSpools() {
  try {
    const rows: Spool[] = await chrome.runtime.sendMessage({ type: "GET_SPOOLS" });
    spools = rows ?? [];
    if (activeTab === "spools") render();
  } catch {
    // background not reachable - keep whatever's already shown
  }
}

async function boot() {
  try {
    settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  } catch {
    // background not reachable - keep defaults
  }

  try {
    const s = await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" });
    if (s && hasAnyData(s)) {
      snapshot = s;
      usingMock = false;
    }
  } catch {
    // fall back to mock snapshot
  }

  // A "TRACE BACK" click in the popup opens the dashboard straight into the
  // Search tab's trace view for that event, instead of landing on Open Threads.
  const params = new URLSearchParams(location.search);
  const traceEventId = params.get("trace");
  if (traceEventId) {
    setActiveTab("search");
    await openTraceBack(traceEventId);
  } else {
    render();
  }

  await loadStats();
  await loadOpenThreads();
  setInterval(loadStats, 15000);
}

boot();
