// RAVEL - background service worker (Manifest V3).
//
// This is the ONLY place that writes to storage. chrome.alarms drives
// periodic deep analysis; light activity (a page observed, a tick)
// triggers an immediate, cheap broadcast so the popup and dashboard update
// in real time without polling. Nothing in this file ever makes a network
// request - Ravel has nothing to phone home to.

import type {
  ActivityEvent,
  CurrentActivity,
  OpenTab,
  OpenThread,
  Spool,
  RavelBroadcast,
  RavelMessage,
  RavelSnapshot,
  RavelStats,
} from "../shared/types";
import { EventsRepo, OpenTabsRepo, SettingsRepo, SpoolsRepo } from "../storage/repositories";
import { deleteEverything, pruneOldEvents, exportAllData } from "../storage/db";
import { runAnalysis, prepareForSearch, searchMemory, traceBack, groupOpenTabs, buildDigest } from "../analysis/index";
import { uid, formatBadgeDuration, extractKeywords, domainFromUrl } from "../shared/utils";

// Badge is scoped per-tab (chrome.action supports a {tabId} option on every
// setter), so Chrome automatically shows the right tab's badge as the user
// switches tabs - no need to track "the active tab" ourselves here.
const BADGE_BG = "#d97a4d"; // --ravel-accent
const BADGE_TEXT = "#15120d"; // --ravel-bg-0, for contrast against the badge

function updateBadge(tabId: number, event: ActivityEvent) {
  chrome.action.setBadgeText({ tabId, text: formatBadgeDuration(event.duration) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_BG });
  chrome.action.setBadgeTextColor?.({ tabId, color: BADGE_TEXT });
  chrome.action.setTitle({
    tabId,
    title: `Ravel: ${event.domain}${event.revisitCount > 0 ? ` (revisit ${event.revisitCount + 1})` : ""}`,
  });
}

function clearBadge(tabId: number) {
  chrome.action.setBadgeText({ tabId, text: "" });
  chrome.action.setTitle({ tabId, title: "Ravel" });
}

// ---- open tabs & thread rescue ("ravel a thread") ----
//
// Separate from tabState below (which tracks the in-progress ActivityEvent
// for badge/duration purposes): this is the live registry of every open
// http(s) tab, independent of whether a content-script signal has arrived
// yet. It backs the popup's "Open Threads" view and the close-and-remember
// flow. Persisted (OpenTabsRepo/IndexedDB) rather than kept only in memory,
// since MV3 service workers can be evicted and respawned mid-session.

function isTrackableUrl(url?: string): boolean {
  return !!url && /^https?:\/\//i.test(url);
}

/** Merges a partial update into an existing OpenTab row, or creates one.
 *  `openedAt` is only ever set once - later calls never overwrite it. */
async function upsertOpenTab(
  tabId: number,
  patch: Partial<Omit<OpenTab, "tabId" | "openedAt">> & { windowId?: number }
): Promise<void> {
  const existing = (await OpenTabsRepo.all()).find((t) => t.tabId === tabId);
  const now = Date.now();
  const next: OpenTab = {
    tabId,
    windowId: patch.windowId ?? existing?.windowId ?? -1,
    url: patch.url ?? existing?.url ?? "",
    domain: patch.domain ?? existing?.domain ?? "",
    title: patch.title ?? existing?.title ?? "",
    keywords: patch.keywords ?? existing?.keywords ?? [],
    openedAt: existing?.openedAt ?? now,
    lastActiveAt: patch.lastActiveAt ?? existing?.lastActiveAt ?? now,
  };
  await OpenTabsRepo.upsert(next);
}

/** Marks a tab as just-touched without changing anything else about it -
 *  the signal that "the user is actually engaging with this right now." */
async function touchOpenTab(tabId: number): Promise<void> {
  const existing = (await OpenTabsRepo.all()).find((t) => t.tabId === tabId);
  if (!existing) return;
  await OpenTabsRepo.upsert({ ...existing, lastActiveAt: Date.now() });
}

/** Reconciles the persisted open-tab registry against the browser's actual
 *  open tabs. Needed on every extension startup - tabIds are not stable
 *  across browser restarts, so anything left over from a prior session is
 *  either stale (drop it) or genuinely still open (adopt it fresh). */
async function reconcileOpenTabs(): Promise<void> {
  const liveTabs = await chrome.tabs.query({});
  const liveIds = new Set(liveTabs.map((t) => t.id).filter((id): id is number => id !== undefined));

  const tracked = await OpenTabsRepo.all();
  for (const t of tracked) {
    if (!liveIds.has(t.tabId)) await OpenTabsRepo.remove(t.tabId);
  }

  const trackedIds = new Set(tracked.map((t) => t.tabId));
  for (const tab of liveTabs) {
    if (tab.id === undefined || trackedIds.has(tab.id)) continue;
    if (!isTrackableUrl(tab.url)) continue;
    await upsertOpenTab(tab.id, {
      windowId: tab.windowId,
      url: tab.url,
      domain: domainFromUrl(tab.url!),
      title: tab.title ?? "",
      keywords: extractKeywords(tab.title ?? "", 6),
      lastActiveAt: Date.now(),
    });
  }
}

async function getOpenThreadsSnapshot(): Promise<OpenThread[]> {
  const [tabs, settings] = await Promise.all([OpenTabsRepo.all(), SettingsRepo.get()]);
  return groupOpenTabs(tabs, settings.staleThreadDays);
}

function broadcastOpenThreads(): void {
  void getOpenThreadsSnapshot().then((threads) => broadcast({ type: "OPEN_THREADS_UPDATED", threads }));
}

// tabId -> current session id + current event id + last url, so we can
// attribute ACTIVE_TIME_TICK deltas to the right stored ActivityEvent.
interface TabState {
  sessionId: string;
  currentEventId: string | null;
  currentUrl: string;
}
const tabState = new Map<number, TabState>();

let cachedSnapshot: RavelSnapshot | null = null;
let lastFullAnalysisAt = 0;
const FULL_ANALYSIS_MIN_GAP_MS = 15_000; // don't re-cluster on every single tick

/** Same normalization rule as analysis/revisitDetection.ts: strip the
 *  fragment, count prior stored events at that URL. */
async function countPriorVisits(url: string): Promise<number> {
  const key = url.split("#")[0];
  const events = await EventsRepo.all();
  return events.filter((e) => e.url.split("#")[0] === key).length;
}

function getTabState(tabId: number): TabState {
  let s = tabState.get(tabId);
  if (!s) {
    s = { sessionId: uid(), currentEventId: null, currentUrl: "" };
    tabState.set(tabId, s);
  }
  return s;
}

/** Best-effort push to any open popup/dashboard. Silently no-ops if nothing is listening. */
function broadcast(message: RavelBroadcast) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // no receivers open - expected most of the time
  }
}

async function handlePageObserved(
  tabId: number,
  payload: Omit<ActivityEvent, "id" | "revisitCount" | "duration" | "sessionId">
) {
  const settings = await SettingsRepo.get();
  if (!settings.trackingEnabled || !settings.platformsEnabled[payload.platform]) {
    clearBadge(tabId);
    return;
  }

  const state = getTabState(tabId);
  state.currentUrl = payload.url;

  // revisitCount is persisted at write time (not just computed transiently
  // during analysis) so the live popup and any stored event both reflect
  // "how many times has this exact URL been observed before, ever."
  const revisitCount = await countPriorVisits(payload.url);

  const event: ActivityEvent = {
    ...payload,
    id: uid(),
    sessionId: state.sessionId,
    duration: 0,
    revisitCount,
  };
  await EventsRepo.add(event);
  state.currentEventId = event.id;

  updateBadge(tabId, event);
  broadcast({ type: "CURRENT_TICK", current: toCurrentActivity(event) });
  await refreshSnapshot(); // a new page is worth re-clustering for immediately

  // The content script's signal is the richest source of keywords/title this
  // tab will ever produce - worth overwriting whatever onCreated/onUpdated
  // guessed from the raw tab object alone.
  await upsertOpenTab(tabId, {
    url: event.url,
    domain: event.domain,
    title: event.title,
    keywords: event.keywords?.length ? event.keywords : extractKeywords(event.title, 6),
    lastActiveAt: Date.now(),
  });
  broadcastOpenThreads();
}

const lastOpenTabTouchAt = new Map<number, number>();
const OPEN_TAB_TOUCH_MIN_GAP_MS = 60_000; // one IndexedDB write per tab per minute of active reading, at most

async function handleActiveTimeTick(tabId: number, deltaMs: number, url: string) {
  const state = tabState.get(tabId);
  if (!state || !state.currentEventId || state.currentUrl !== url) return;

  const settings = await SettingsRepo.get();
  if (!settings.trackingEnabled) {
    clearBadge(tabId);
    return;
  }

  const event = await EventsRepo.byId(state.currentEventId);
  if (!event) return;
  if (!settings.platformsEnabled[event.platform]) {
    clearBadge(tabId);
    return;
  }
  event.duration += deltaMs;
  await EventsRepo.add(event);

  updateBadge(tabId, event);
  broadcast({ type: "CURRENT_TICK", current: toCurrentActivity(event) });

  // "Actively being read" is the strongest possible signal that a thread is
  // NOT stale - but writing to IndexedDB on every 5s tick is wasteful, so
  // this is throttled the same way full re-clustering already is below.
  const lastTouch = lastOpenTabTouchAt.get(tabId) ?? 0;
  if (Date.now() - lastTouch > OPEN_TAB_TOUCH_MIN_GAP_MS) {
    lastOpenTabTouchAt.set(tabId, Date.now());
    await touchOpenTab(tabId);
  }

  if (Date.now() - lastFullAnalysisAt > FULL_ANALYSIS_MIN_GAP_MS) {
    await refreshSnapshot();
  }
}

function toCurrentActivity(event: ActivityEvent): CurrentActivity {
  return {
    url: event.url,
    domain: event.domain,
    title: event.title,
    platform: event.platform,
    contentType: event.contentType,
    startedAt: event.timestamp,
    duration: event.duration,
    revisitCount: event.revisitCount,
  };
}

async function refreshSnapshot(): Promise<RavelSnapshot> {
  const events = await EventsRepo.all();
  cachedSnapshot = runAnalysis(events);
  lastFullAnalysisAt = Date.now();
  broadcast({ type: "SNAPSHOT_UPDATED", snapshot: cachedSnapshot });
  return cachedSnapshot;
}

/** Reads the *active tab in the current window*'s in-progress event, for the popup's live strip. */
async function getCurrentActivity(): Promise<CurrentActivity | null> {
  const settings = await SettingsRepo.get();
  if (!settings.trackingEnabled) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  const state = tabState.get(tab.id);
  if (!state?.currentEventId) return null;
  const event = await EventsRepo.byId(state.currentEventId);
  return event ? toCurrentActivity(event) : null;
}

async function getStats(): Promise<RavelStats> {
  const events = await EventsRepo.all();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayMs = startOfDay.getTime();

  const today = events.filter((e) => e.timestamp >= todayMs);
  const activeTodayMs = today.reduce((sum, e) => sum + e.duration, 0);
  const sessionsToday = new Set(today.map((e) => e.sessionId)).size;
  const domainsTracked = new Set(events.map((e) => e.domain)).size;

  return {
    activeTodayMs,
    sessionsToday,
    domainsTracked,
    eventsTracked: events.length,
  };
}

chrome.runtime.onMessage.addListener((message: RavelMessage, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  (async () => {
    switch (message.type) {
      case "PAGE_OBSERVED":
        if (tabId !== undefined) await handlePageObserved(tabId, message.payload);
        sendResponse({ ok: true });
        break;

      case "ACTIVE_TIME_TICK":
        if (tabId !== undefined)
          await handleActiveTimeTick(tabId, message.payload.deltaMs, message.payload.url);
        sendResponse({ ok: true });
        break;

      case "GET_SNAPSHOT": {
        const snapshot = cachedSnapshot ?? (await refreshSnapshot());
        sendResponse(snapshot);
        break;
      }

      case "GET_CURRENT":
        sendResponse(await getCurrentActivity());
        break;

      case "GET_STATS":
        sendResponse(await getStats());
        break;

      case "DELETE_EVERYTHING":
        await deleteEverything();
        cachedSnapshot = null;
        sendResponse({ ok: true });
        break;

      case "GET_SETTINGS":
        sendResponse(await SettingsRepo.get());
        break;

      case "SET_SETTINGS": {
        const updated = await SettingsRepo.set(message.payload);
        if (!updated.trackingEnabled) await clearAllBadges();
        broadcastOpenThreads(); // covers a staleThreadDays change re-flagging threads live
        // Every open popup/dashboard/options page holds its own copy of
        // settings fetched once at boot (see GET_SETTINGS above) - without
        // this broadcast, a change made in Options never reaches an
        // already-open dashboard until it's closed and reopened.
        broadcast({ type: "SETTINGS_UPDATED", settings: updated });
        sendResponse(updated);
        break;
      }

      case "EXPORT_ALL_DATA":
        // The full raw dataset (all stored events, plus settings), not just
        // the last computed insight snapshot - this is what "Export local
        // data" on the settings page actually promises the user.
        sendResponse(await exportAllData());
        break;

      case "GET_OPEN_THREADS": {
        sendResponse(await getOpenThreadsSnapshot());
        break;
      }

      case "RAVEL_THREAD": {
        // The whole mechanic: close these tabs, but only after writing down
        // enough that closing them is actually safe. tabIds not found among
        // currently tracked tabs (already closed by the user, e.g.) are
        // skipped rather than failing the whole action.
        const allOpen = await OpenTabsRepo.all();
        const tabs = allOpen.filter((t) => message.payload.tabIds.includes(t.tabId));
        if (tabs.length === 0) {
          sendResponse({ error: "Those tabs are already closed." });
          break;
        }
        const spool: Spool = {
          id: uid(),
          label: message.payload.label,
          keywords: message.payload.keywords,
          tabs: tabs.map((t) => ({ url: t.url, title: t.title, domain: t.domain })),
          openedAt: Math.min(...tabs.map((t) => t.openedAt)),
          closedAt: Date.now(),
          digest: buildDigest(tabs, message.payload.label),
        };
        await SpoolsRepo.add(spool);
        for (const t of tabs) {
          try {
            await chrome.tabs.remove(t.tabId);
          } catch {
            // tab already gone - fine, we still archived it
          }
          await OpenTabsRepo.remove(t.tabId);
        }
        broadcastOpenThreads();
        sendResponse(spool);
        break;
      }

      case "GET_SPOOLS": {
        sendResponse(await SpoolsRepo.all());
        break;
      }

      case "DELETE_SPOOL": {
        await SpoolsRepo.remove(message.payload.id);
        sendResponse({ ok: true });
        break;
      }

      case "SEARCH_MEMORY": {
        const rawEvents = await EventsRepo.all();
        const { events, clusters, rabbitHoles } = prepareForSearch(rawEvents);
        const results = searchMemory(
          message.payload.query,
          events,
          clusters,
          rabbitHoles,
          message.payload.filters,
          message.payload.limit ?? 8
        );
        sendResponse(results);
        break;
      }

      case "TRACE_BACK": {
        const rawEvents = await EventsRepo.all();
        const { events, rabbitHoles } = prepareForSearch(rawEvents);
        sendResponse(traceBack(message.payload.eventId, events, rabbitHoles));
        break;
      }
    }
  })();

  return true; // keep the message channel open for the async response
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
  lastOpenTabTouchAt.delete(tabId);
  void OpenTabsRepo.remove(tabId).then(broadcastOpenThreads);
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined || !isTrackableUrl(tab.url)) return;
  void upsertOpenTab(tab.id, {
    windowId: tab.windowId,
    url: tab.url,
    domain: domainFromUrl(tab.url!),
    title: tab.title ?? "",
    keywords: extractKeywords(tab.title ?? "", 6),
    lastActiveAt: Date.now(),
  }).then(broadcastOpenThreads);
});

// Switching to a tab is a strong "the user is engaging with this, not
// hoarding it" signal - the same reason ACTIVE_TIME_TICK touches a tab.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void touchOpenTab(tabId).then(broadcastOpenThreads);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isTrackableUrl(tab.url)) return;
  if (changeInfo.url) {
    // Navigated to a new page - the old keywords no longer apply; the
    // content script's PAGE_OBSERVED will refine this shortly after.
    void upsertOpenTab(tabId, {
      windowId: tab.windowId,
      url: tab.url,
      domain: domainFromUrl(tab.url!),
      title: tab.title ?? "",
      keywords: extractKeywords(tab.title ?? "", 6),
      lastActiveAt: Date.now(),
    }).then(broadcastOpenThreads);
  } else if (changeInfo.title) {
    void upsertOpenTab(tabId, { title: changeInfo.title }).then(broadcastOpenThreads);
  }
});

// If the user flips tracking (or a whole platform) off from the options
// page, wipe every open tab's badge immediately rather than waiting for
// the next tick/navigation to notice.
async function clearAllBadges() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) if (tab.id !== undefined) clearBadge(tab.id);
}

// Periodic deep analysis + retention pruning. No network involved.
chrome.alarms.create("ravel-analysis", { periodInMinutes: 5 });
chrome.alarms.create("ravel-prune", { periodInMinutes: 60 * 12 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "ravel-analysis") {
    await refreshSnapshot();
  }
  if (alarm.name === "ravel-prune") {
    const settings = await SettingsRepo.get();
    await pruneOldEvents(settings.retentionDays);
  }
});

async function boot() {
  await SettingsRepo.get(); // seeds default settings row on first install
  await reconcileOpenTabs(); // tabIds don't survive a browser restart - resync against reality
  broadcastOpenThreads();
  await refreshSnapshot();
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await boot();
  // First install only, not an update or a browser profile re-sync -
  // land on the dashboard's Home tab, which prompts for a name when
  // settings.userName is still empty.
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  }
});
chrome.runtime.onStartup.addListener(boot);
