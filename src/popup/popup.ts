import type {
  CurrentActivity,
  OpenThread,
  Platform,
  RabbitHole,
  SearchResult,
  TopicCluster,
  Spool,
  TrailStep,
  RavelBroadcast,
  RavelSnapshot,
  RavelSettings,
} from "../shared/types";
import { formatDuration } from "../shared/utils";
import { coveredTabs, threadLossLine, wayBackText } from "../analysis/wayBack";
import { MOCK_SNAPSHOT } from "./mockData";
import { animate, stagger } from "../vendor/anime.esm.js";

const root = document.getElementById("popup-root")!;

// ---------------- MOTION ----------------
// RAVEL's sections used to just appear - a snapshot re-render swapped
// innerHTML with no sense that something had actually surfaced. These
// choreograph the reveal instead: sections rise in as a group, then the
// rabbit-hole trail draws itself node by node, so "YOU FELL INTO" reads as
// an event, not static text.

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function playPopupEntrance(container: HTMLElement) {
  const sections = Array.from(container.querySelectorAll<HTMLElement>(".ravel-section"));
  if (sections.length === 0) return;

  if (REDUCED_MOTION) {
    sections.forEach((s) => (s.style.opacity = "1"));
  } else {
    animate(sections, {
      opacity: [0, 1],
      translateY: [14, 0],
      filter: ["blur(4px)", "blur(0px)"],
      duration: 620,
      delay: stagger(150),
      ease: "outQuart",
      onComplete: () => {
        sections.forEach((s) => {
          s.style.opacity = "";
          s.style.transform = "";
          s.style.filter = "";
        });
      },
    } as Record<string, unknown>);
  }

  animateRabbitHoleTrail(container);
  animateTopicChips(container);
}

// the trail (● ── ● ── ●) draws itself left to right: each stop pops with
// a slight overshoot, each connecting line grows in right after.
function animateRabbitHoleTrail(container: HTMLElement) {
  if (REDUCED_MOTION) return;
  const trail = container.querySelector<HTMLElement>(".rabbit-hole-trail");
  if (!trail) return;

  const dots = Array.from(trail.querySelectorAll<HTMLElement>(".hole-dot"));
  const lines = Array.from(trail.querySelectorAll<HTMLElement>(".hole-line"));
  lines.forEach((line) => (line.style.transformOrigin = "left center"));

  if (dots.length) {
    animate(dots, {
      scale: [0, 1],
      opacity: [0, 1],
      duration: 380,
      delay: (_el: Element, i: number) => 140 + i * 170,
      ease: "outBack",
    } as Record<string, unknown>);
  }
  if (lines.length) {
    animate(lines, {
      scaleX: [0, 1],
      duration: 220,
      delay: (_el: Element, i: number) => 140 + i * 170 + 95,
      ease: "outQuad",
    } as Record<string, unknown>);
  }
}

// each related-topic chip settles in with a slight stagger - a row
// filling in, not a layout resolving itself.
function animateTopicChips(container: HTMLElement) {
  if (REDUCED_MOTION) return;
  const row = container.querySelector<HTMLElement>(".topic-chip-row");
  if (!row) return;

  const chips = Array.from(row.querySelectorAll<HTMLElement>(".topic-chip"));
  if (chips.length) {
    animate(chips, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: 340,
      delay: (_el: Element, i: number) => 120 + i * 70,
      ease: "outQuart",
    } as Record<string, unknown>);
  }
}

// search results feed in as a stack, most-likely trace first.
function animateSearchResults(container: HTMLElement) {
  if (REDUCED_MOTION) return;
  const heading = container.querySelector<HTMLElement>(".search-heading");
  const cards = Array.from(container.querySelectorAll<HTMLElement>(".trace-card"));
  if (cards.length === 0) return;

  if (heading) {
    animate(heading, { opacity: [0, 1], translateY: [-4, 0], duration: 300, ease: "outQuad" } as Record<
      string,
      unknown
    >);
  }
  animate(cards, {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 360,
    delay: (_el: Element, i: number) => 90 + i * 90,
    ease: "outQuart",
    onComplete: () => cards.forEach((c) => (c.style.transform = "")), // release control back to the :hover lift
  } as Record<string, unknown>);
}
const currentCard = document.getElementById("current-card")!;
const currentBadge = document.getElementById("current-badge")!;
const currentDomain = document.getElementById("current-domain")!;
const currentTitle = document.getElementById("current-title")!;
const currentTimer = document.getElementById("current-timer")!;
const liveIndicator = document.getElementById("status-dot")!;

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

// ---------------- RIGHT NOW (live) ----------------

const PLATFORM_INITIAL: Record<Platform, string> = {
  generic: "◦",
  youtube: "▶",
  instagram: "◇",
  netflix: "▭",
};

let liveDuration = 0; // ms, ticks up locally between real syncs for a smooth counter
let liveTickHandle: ReturnType<typeof setInterval> | null = null;
let lastSeenUrl = "";

function formatClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setCurrent(current: CurrentActivity | null) {
  if (!current) {
    currentCard.hidden = true;
    liveIndicator.classList.remove("is-active");
    lastSeenUrl = "";
    if (liveTickHandle) {
      clearInterval(liveTickHandle);
      liveTickHandle = null;
    }
    return;
  }

  const isNewSite = current.url !== lastSeenUrl;
  lastSeenUrl = current.url;

  currentCard.hidden = false;
  liveIndicator.classList.add("is-active");
  currentBadge.textContent = PLATFORM_INITIAL[current.platform] ?? "◦";
  currentBadge.className = `current-platform-badge platform-${current.platform}`;
  currentDomain.textContent =
    current.revisitCount > 0 ? `${current.domain} · revisit ${current.revisitCount + 1}` : current.domain;
  currentTitle.textContent = current.title || current.domain;

  liveDuration = current.duration;
  currentTimer.textContent = formatClock(liveDuration);

  // A brief highlight every time the tracked page actually changes, so the
  // popup visibly reacts to "a new site was just visited" rather than only
  // the numbers quietly updating underneath.
  if (isNewSite) {
    currentCard.classList.remove("just-visited");
    void currentCard.offsetWidth; // restart the animation if it's already mid-flash
    currentCard.classList.add("just-visited");
  }

  if (!liveTickHandle) {
    liveTickHandle = setInterval(() => {
      liveDuration += 1000;
      currentTimer.textContent = formatClock(liveDuration);
    }, 1000);
  }
}

// ---------------- NOW (topic cluster) ----------------

function renderNow(now: TopicCluster | null, related: TopicCluster[]): HTMLElement {
  const section = el("section", "ravel-section");

  if (!now) {
    section.append(el("div", "ravel-eyebrow", "YOU'RE EXPLORING"));
    section.append(
      el("div", "ravel-empty", "Nothing strong enough to name yet. Keep browsing, patterns take a little time to surface.")
    );
    return section;
  }

  section.append(el("div", "ravel-eyebrow", "YOU'RE EXPLORING"));
  section.append(el("h1", "ravel-section-title", now.label));

  const stats = el("div", "ravel-stats");
  stats.append(el("span", undefined, `${now.eventIds.length} pieces of content`));
  stats.append(el("span", undefined, `${formatDuration(now.totalDuration)} today`));
  section.append(stats);

  section.append(renderSiteList(now.sites));

  // Related topics as a plain wrapping row of tags - every label shown
  // in full, laid out by flexbox rather than trigonometry, so nothing
  // overlaps and nothing gets clipped regardless of how many there are.
  const related8 = related.slice(0, 8);
  if (related8.length) {
    const row = el("div", "topic-chip-row");
    related8.forEach((topic) => {
      row.append(el("span", "topic-chip", topic.label));
    });
    section.append(row);
  }

  return section;
}

// ---------------- RABBIT HOLES ----------------

function renderRabbitHoles(holes: RabbitHole[]): HTMLElement {
  const section = el("section", "ravel-section");
  section.append(el("div", "ravel-eyebrow", "YOU FELL INTO"));

  if (holes.length === 0) {
    section.append(el("div", "ravel-empty", "No deep trails detected recently."));
    return section;
  }

  const hole = holes[0];
  section.append(el("h1", "ravel-section-title", hole.label.toUpperCase()));

  const stats = el("div", "ravel-stats");
  stats.append(el("span", undefined, formatDuration(hole.duration)));
  stats.append(el("span", undefined, `${hole.eventIds.length} pieces of content`));
  section.append(stats);

  const card = el("div", "rabbit-hole-card");
  card.setAttribute("aria-expanded", "false");

  // the trail itself: a physical path, always visible - nodes are the
  // stops, the connecting line is the path between them.
  const trailEl = el("div", "rabbit-hole-trail");
  hole.trail.forEach((step, i) => {
    if (i > 0) trailEl.append(el("div", "hole-line"));
    const node = el("div", "hole-node");
    node.title = `${step.title || step.id}${step.domain ? " · " + step.domain : ""}`;
    node.append(el("span", "hole-dot"));
    trailEl.append(node);
  });
  card.append(trailEl);

  const toggle = el("button", "rabbit-hole-toggle");
  toggle.append(el("span", undefined, "Named stops"));
  toggle.append(el("span", "rabbit-hole-chevron", "›"));
  toggle.addEventListener("click", () => {
    const expanded = card.getAttribute("aria-expanded") === "true";
    card.setAttribute("aria-expanded", String(!expanded));
  });
  card.append(toggle);

  // expanded detail: the same stops, named, once opened - still no card,
  // just type, indented under the trail it belongs to.
  const detail = el("div", "trail-step-list");
  hole.trail.forEach((step) => {
    const stepEl = el("div", "trail-step");
    stepEl.append(document.createTextNode(step.title || step.id));
    stepEl.append(el("span", "trail-step-domain", step.domain || ""));
    detail.append(stepEl);
  });
  card.append(detail);

  section.append(card);
  return section;
}

// ---------------- SITE RECORD (per topic) ----------------
// A record of every site that fed a topic - collapsed by default since a
// live-tracking popup can accumulate a long list fast.

function renderSiteList(sites: TrailStep[]): HTMLElement {
  const wrap = el("div", "site-list-wrap");
  if (sites.length === 0) return wrap;

  const toggle = el("button", "site-list-toggle");
  toggle.append(el("span", undefined, `Sites recorded (${sites.length})`));
  toggle.append(el("span", "site-list-chevron", "›"));
  wrap.append(toggle);
  wrap.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => {
    const expanded = wrap.getAttribute("aria-expanded") === "true";
    wrap.setAttribute("aria-expanded", String(!expanded));
  });

  const list = el("div", "site-list");
  // newest first - the most recent addition to a topic is usually what
  // the person actually wants to find again.
  [...sites].reverse().forEach((site) => {
    const row = el("div", "site-list-row");
    row.append(el("span", "site-list-title", site.title || site.domain));
    row.append(el("span", "site-list-domain", site.domain));
    list.append(row);
  });
  wrap.append(list);

  return wrap;
}

// ---------------- LIVE / OFF TOGGLE ----------------

const trackingToggle = document.getElementById("tracking-toggle") as HTMLButtonElement;
const trackingToggleLabel = document.getElementById("tracking-toggle-label")!;
let trackingEnabled = true;

function applyTrackingUi(enabled: boolean) {
  trackingEnabled = enabled;
  trackingToggle.classList.toggle("is-off", !enabled);
  trackingToggleLabel.textContent = enabled ? "LIVE" : "OFF";
  trackingToggle.title = enabled ? "Tracking is on: click to pause" : "Tracking is paused: click to resume";
}

async function loadSettings() {
  try {
    const settings: RavelSettings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    applyTrackingUi(settings.trackingEnabled);
  } catch {
    // background not reachable - leave default (on) state
  }
}

trackingToggle?.addEventListener("click", async () => {
  const next = !trackingEnabled;
  applyTrackingUi(next); // optimistic - feels instant
  try {
    const updated: RavelSettings = await chrome.runtime.sendMessage({
      type: "SET_SETTINGS",
      payload: { trackingEnabled: next },
    });
    applyTrackingUi(updated.trackingEnabled);
    if (!updated.trackingEnabled) setCurrent(null); // nothing is being tracked anymore
  } catch {
    applyTrackingUi(!next); // revert on failure
  }
});

function render(snapshot: RavelSnapshot, usingMock: boolean) {
  root.innerHTML = "";
  if (usingMock) {
    const badge = el("div", "preview-badge", "PREVIEW: SHOWN BEFORE RAVEL HAS DATA OF YOUR OWN");
    root.append(badge);
  }
  root.append(renderNow(snapshot.now, snapshot.relatedTopics));
  root.append(renderRabbitHoles(snapshot.rabbitHoles));
  playPopupEntrance(root);
}

function hasAnyData(s: RavelSnapshot): boolean {
  return !!s.now || s.rabbitHoles.length > 0;
}

async function loadSnapshot() {
  try {
    const snapshot = await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" });
    if (snapshot && hasAnyData(snapshot)) render(snapshot, false);
    else render(MOCK_SNAPSHOT, true);
  } catch {
    // background not reachable (e.g. previewing popup.html outside the extension) - show mock
    render(MOCK_SNAPSHOT, true);
  }
}

async function loadCurrent() {
  try {
    const current: CurrentActivity | null = await chrome.runtime.sendMessage({ type: "GET_CURRENT" });
    setCurrent(current);
  } catch {
    setCurrent(null);
  }
}

// Live push updates from the background worker - this is what makes the
// popup track the page you're actually on instead of a stale snapshot.
chrome.runtime.onMessage.addListener((message: RavelBroadcast) => {
  if (message.type === "CURRENT_TICK") setCurrent(message.current);
  if (message.type === "SNAPSHOT_UPDATED" && hasAnyData(message.snapshot)) {
    render(message.snapshot, false);
  }
  // Keep the LIVE/OFF toggle in sync if settings changed from the Options
  // page (or the dashboard) while this popup is open.
  if (message.type === "SETTINGS_UPDATED") {
    applyTrackingUi(message.settings.trackingEnabled);
  }
  if (message.type === "OPEN_THREADS_UPDATED") {
    renderThreads(message.threads);
  }
});

// Fallback poll - covers the rare case where the service worker was
// suspended and missed a broadcast (MV3 workers can go idle between events).
setInterval(loadCurrent, 4000);

document.getElementById("enter-ravel")?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});

// ---------------- OPEN THREADS - the rescue mechanic ----------------
// The reason this extension exists: a currently-open tab is either being
// used (leave it alone) or it's been sitting untouched long enough that
// keeping it open is pure anxiety, not intent. This section groups every
// open http(s) tab into threads by topic (background/staleThreads.ts) and
// lets a stale one be closed with confidence - the digest shown here is
// exactly what survives.

const threadsListEl = document.getElementById("threads-list")!;
const threadsCountEl = document.getElementById("threads-count")!;

function threadKey(thread: OpenThread): string {
  return thread.tabs
    .map((t) => t.tabId)
    .sort((a, b) => a - b)
    .join(",");
}

const openConfirmKeys = new Set<string>();
let lastThreads: OpenThread[] = [];

function fmtQuiet(days: number): string {
  if (days < 1) return "active in the last day";
  if (days < 2) return "quiet for 1 day";
  return `quiet for ${Math.round(days)} days`;
}

function renderThreads(threads: OpenThread[]) {
  lastThreads = threads;
  threadsListEl.innerHTML = "";

  const totalTabs = threads.reduce((sum, t) => sum + t.tabs.length, 0);
  threadsCountEl.textContent = totalTabs > 0 ? `${totalTabs} TABS · ${threads.length} THREAD${threads.length === 1 ? "" : "S"}` : "";

  if (threads.length === 0) {
    threadsListEl.append(el("div", "threads-empty", "No open tabs tracked yet. Ravel watches http/https tabs as you browse."));
    return;
  }

  // Covered tabs cost nothing to close, whatever their age, so they're
  // offered from the first minute instead of after days of quiet.
  const covered = coveredTabs(threads);
  if (covered.length > 0) {
    const bar = el("div", "covered-bar");
    bar.append(
      el("span", "covered-text", `${covered.length} tab${covered.length === 1 ? " is" : "s are"} already covered by another open tab. Nothing to lose.`)
    );
    const btn = el("button", "thread-ravel-btn", "CLOSE COVERED");
    btn.addEventListener("click", () =>
      ravelThread({ label: "Covered tabs", keywords: [], tabs: covered, hardTabs: 0, lastActiveAt: 0, quietDays: 0, isStale: false }, "covered")
    );
    bar.append(btn);
    threadsListEl.append(bar);
  }

  threads.forEach((thread) => {
    const key = threadKey(thread);
    const row = el("div", `thread-row${thread.isStale ? " is-stale" : ""}`);
    row.dataset.key = key;

    const main = el("div", "thread-row-main");
    main.append(el("span", "thread-dot"));

    const text = el("div", "thread-text");
    text.append(el("div", "thread-label", thread.label));
    const tabWord = thread.tabs.length === 1 ? "1 tab" : `${thread.tabs.length} tabs`;
    text.append(el("div", "thread-meta", `${tabWord} · ${fmtQuiet(thread.quietDays)} · ${threadLossLine(thread)}`));
    main.append(text);

    const button = el("button", "thread-ravel-btn", thread.isStale ? "RAVEL IT" : "RAVEL");
    button.addEventListener("click", () => {
      if (openConfirmKeys.has(key)) openConfirmKeys.delete(key);
      else openConfirmKeys.add(key);
      renderThreads(lastThreads);
    });
    main.append(button);
    row.append(main);

    if (openConfirmKeys.has(key)) {
      row.append(renderThreadConfirm(thread, key));
    }

    threadsListEl.append(row);
  });
}

function renderThreadConfirm(thread: OpenThread, key: string): HTMLElement {
  const panel = el("div", "thread-confirm");
  const domains = [...new Set(thread.tabs.map((t) => t.domain))];
  const span =
    thread.tabs.length > 1
      ? `${thread.tabs.length} tabs across ${domains.length} site${domains.length === 1 ? "" : "s"}`
      : `1 tab on ${domains[0] ?? "unknown"}`;
  panel.append(
    el(
      "div",
      "thread-confirm-digest",
      `This is what stays after closing: ${span}. Every title and site below is kept, searchable, in your local memory.`
    )
  );

  const tabsList = el("div", "thread-confirm-tabs");
  // Each tab shows what closing it costs and how it comes back.
  thread.tabs.forEach((t) => {
    const row = el("div", `thread-confirm-tab way-${t.wayBack.cost}`, `${t.title || t.domain} · ${t.domain}`);
    row.append(el("div", "thread-confirm-way", wayBackText(t.wayBack)));
    tabsList.append(row);
  });
  panel.append(tabsList);

  const actions = el("div", "thread-confirm-actions");
  const confirmBtn = el("button", "thread-confirm-btn primary", "CLOSE & REMEMBER");
  confirmBtn.addEventListener("click", () => ravelThread(thread, key));
  const cancelBtn = el("button", "thread-confirm-btn ghost", "NEVER MIND");
  cancelBtn.addEventListener("click", () => {
    openConfirmKeys.delete(key);
    renderThreads(lastThreads);
  });
  actions.append(confirmBtn, cancelBtn);
  panel.append(actions);

  return panel;
}

async function ravelThread(thread: OpenThread, key: string) {
  const row = threadsListEl.querySelector<HTMLElement>(`[data-key="${key}"]`);
  row?.classList.add("just-ravelled");
  openConfirmKeys.delete(key);
  try {
    const result: Spool | { error: string } = await chrome.runtime.sendMessage({
      type: "RAVEL_THREAD",
      payload: {
        tabIds: thread.tabs.map((t) => t.tabId),
        label: thread.label,
        keywords: thread.keywords,
      },
    });
    if (!("error" in result)) showThreadToast(`Saved "${result.label}" to your Spools and closed ${result.tabs.length} tab${result.tabs.length === 1 ? "" : "s"}.`);
  } catch {
    // background unreachable - the row simply won't update; nothing was lost
  }
}

let threadToastTimeout: ReturnType<typeof setTimeout> | null = null;
function showThreadToast(text: string) {
  let toast = document.querySelector<HTMLElement>(".thread-toast");
  if (!toast) {
    toast = el("div", "thread-toast");
    threadsListEl.parentElement?.insertAdjacentElement("afterend", toast);
  }
  toast.textContent = text;
  toast.hidden = false;
  if (threadToastTimeout) clearTimeout(threadToastTimeout);
  threadToastTimeout = setTimeout(() => toast?.remove(), 3200);
}

async function loadOpenThreads() {
  try {
    const threads: OpenThread[] = await chrome.runtime.sendMessage({ type: "GET_OPEN_THREADS" });
    renderThreads(threads ?? []);
  } catch {
    renderThreads([]);
  }
}

// ---------------- MEMORY SEARCH - the core of RAVEL ----------------
// "What are you trying to remember?" A real local search over stored
// ActivityEvents (background/serviceWorker.ts -> analysis/search/*). No
// network call is made; nothing here is fabricated - an empty result set
// is shown honestly as "no traces found."

const searchInput = document.getElementById("memory-search-input") as HTMLInputElement;
const searchClear = document.getElementById("memory-search-clear") as HTMLButtonElement;
const searchResultsEl = document.getElementById("search-results")!;
const idleView = document.getElementById("idle-view") as HTMLElement;

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

function fmtAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function fmtClockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Turns the ranker's structured match reasons into the one line of "why
 *  this may be it" the user sees - always built from a real reason, never invented. */
function reasonText(r: SearchResult): string | null {
  const topic = r.reasons.find((x) => x.kind === "topic");
  if (topic?.kind === "topic") return `part of what you explored around ${topic.label}`;
  const keywords = r.reasons.filter((x) => x.kind === "keyword").map((x) => (x.kind === "keyword" ? x.keyword : ""));
  if (keywords.length > 0) return `matched: ${keywords.slice(0, 3).join(", ")}`;
  const platform = r.reasons.find((x) => x.kind === "platform");
  if (platform?.kind === "platform") return `found on ${platform.platform}`;
  const domain = r.reasons.find((x) => x.kind === "domain");
  if (domain?.kind === "domain") return `matched the site name`;
  return null;
}

function renderSearchResults(results: SearchResult[]) {
  searchResultsEl.innerHTML = "";
  idleView.hidden = true;
  searchResultsEl.hidden = false;

  if (results.length === 0) {
    const empty = el(
      "div",
      "search-empty",
      // Say exactly what's searched, so a miss reads as "use a different
      // word", not "Ravel lost it". Matching is on words, not meaning.
      "Nothing matched. Ravel matches the words in page titles, site names and addresses, not meaning, so try a word that was in the title or the site, like \"streeteasy\" rather than \"that apartment\"."
    );
    searchResultsEl.append(empty);
    return;
  }

  searchResultsEl.append(
    el("div", "search-heading", `I FOUND ${results.length} POSSIBLE TRACE${results.length === 1 ? "" : "S"}`)
  );

  results.slice(0, 3).forEach((r, i) => {
    const card = el("div", i === 0 ? "trace-card is-most-likely" : "trace-card");
    if (i === 0) card.append(el("div", "trace-most-likely", "MOST LIKELY"));

    card.append(el("div", "trace-title", r.event.title || r.event.domain));
    card.append(
      el("div", "trace-meta", `${r.event.domain} · ${fmtAgo(r.event.timestamp)} · ${fmtClockTime(r.event.timestamp)}`)
    );

    const reason = reasonText(r);
    if (reason) card.append(el("div", "trace-why", `Why this may be it: ${reason}`));

    const actions = el("div", "trace-actions");
    const openBtn = el("button", "trace-btn", "OPEN");
    openBtn.addEventListener("click", () => chrome.tabs.create({ url: r.event.url }));
    const traceBtn = el("button", "trace-btn trace-btn-ghost", "TRACE BACK");
    traceBtn.addEventListener("click", () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL(`dashboard/dashboard.html?trace=${encodeURIComponent(r.event.id)}`),
      });
    });
    actions.append(openBtn, traceBtn);
    card.append(actions);

    searchResultsEl.append(card);
  });

  animateSearchResults(searchResultsEl);
}

async function runSearch(query: string) {
  if (!query.trim()) {
    searchResultsEl.hidden = true;
    idleView.hidden = false;
    return;
  }
  try {
    const results: SearchResult[] = await chrome.runtime.sendMessage({
      type: "SEARCH_MEMORY",
      payload: { query, limit: 5 },
    });
    renderSearchResults(results ?? []);
  } catch {
    renderSearchResults([]);
  }
}

searchInput?.addEventListener("input", () => {
  searchClear.hidden = searchInput.value.length === 0;
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => runSearch(searchInput.value), 350);
});

searchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (searchDebounce) clearTimeout(searchDebounce);
    runSearch(searchInput.value);
  }
});

searchClear?.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.hidden = true;
  runSearch("");
  searchInput.focus();
});

loadSnapshot();
loadCurrent();
loadSettings();
loadOpenThreads();
