// RAVEL - shared data model
// Every type here describes data that lives ONLY on the user's device.

export type Platform = "generic" | "youtube" | "instagram" | "netflix";

/** Which real, on-page signal a piece of extracted data came from. Used to
 *  compute extraction confidence and to explain (never invent) why RAVEL
 *  believes what it believes about a page. */
export type ExtractionSource =
  | "schema-org"
  | "open-graph"
  | "meta-description"
  | "platform-dom"
  | "heading"
  | "body-text"
  | "title-tag"
  | "url-fallback";

export type ContentType =
  | "page"
  | "video"
  | "reel"
  | "show"
  | "movie"
  | "article"
  | "search"
  | "unknown";

/** A single unit of observed activity. The atomic record RAVEL stores. */
export interface ActivityEvent {
  id: string;
  timestamp: number; // ms epoch, when the event was first observed
  url: string;
  domain: string;
  title: string;
  platform: Platform;
  contentType: ContentType;
  sessionId: string; // groups events from one continuous browsing session
  duration: number; // ms of active (visible, non-idle) time attributed to this event
  revisitCount: number;
  keywords?: string[]; // derived locally, never sent anywhere
  meta?: Record<string, string | number | undefined>; // adapter-specific extras (channel, creator, etc)
  /** Short semantic summary of the page - from Open Graph, schema.org, or a
   *  meta description tag, in that preference order. Never fabricated;
   *  absent when no such tag exists. Bounded to a few hundred chars. */
  description?: string;
  /** How this event's title/description/keywords were actually obtained,
   *  and how much weight downstream analysis should give them. Confidence
   *  is derived only from which real signals were present - never guessed. */
  extraction?: { sources: ExtractionSource[]; confidence: number };
}

/** A group of ActivityEvents that share a topic, discovered locally. */
export interface TopicCluster {
  id: string;
  label: string;
  keywords: string[];
  eventIds: string[];
  /** Every site/page seen under this topic, oldest first - the actual
   *  record of what built the cluster, not just a count. */
  sites: TrailStep[];
  firstSeen: number;
  lastSeen: number;
  totalDuration: number;
  score: number; // strength of the cluster, used to pick "NOW"
}

/** A single stop in a rabbit hole's trail, carrying enough of the source
 *  event for the UI to render a real title/domain without a second
 *  storage round trip. */
export interface TrailStep {
  id: string;
  title: string;
  domain: string;
}

/** A detected rabbit hole - a fast, connected trail through one topic. */
export interface RabbitHole {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  eventIds: string[]; // ordered trail (ids only, kept for cross-referencing)
  trail: TrailStep[]; // ordered trail with real title/domain, same order as eventIds
}

export interface RavelSettings {
  platformsEnabled: Record<Platform, boolean>;
  retentionDays: number; // 0 = forever
  trackingEnabled: boolean;
  /** How many days an open thread can sit untouched before the popup's
   *  Open Threads view flags it as a rescue candidate ("RAVEL IT"). Purely
   *  a nudge threshold - nothing is ever closed automatically. */
  staleThreadDays: number;
  /** What the dashboard's Home tab greets you by. Empty until the
   *  first-run prompt is answered; never required for anything else. */
  userName: string;
}

/** The event currently in progress in the active tab, if any - drives the live popup ticker. */
export interface CurrentActivity {
  url: string;
  domain: string;
  title: string;
  platform: Platform;
  contentType: ContentType;
  startedAt: number; // ms epoch
  duration: number; // ms accumulated so far
  revisitCount: number; // 0 = first time seeing this exact URL
}

/** Cheap aggregate counters for the dashboard overview strip. Recomputed from raw events. */
export interface RavelStats {
  activeTodayMs: number;
  sessionsToday: number;
  domainsTracked: number;
  eventsTracked: number;
}


// ---- memory search ("what are you trying to remember?") ----

export interface SearchFilters {
  when?: "today" | "yesterday" | "week" | "month" | "earlier";
  platform?: Platform;
  /** How the page was reached, inferred only from real session adjacency -
   *  never fabricated. "rabbitHole": part of a detected trail. "revisited":
   *  seen more than once. "continued": followed another page in the same
   *  session. "fresh": first thing observed in its session. */
  how?: "rabbitHole" | "revisited" | "continued" | "fresh";
}

/** A single reason a result matched, surfaced to the user verbatim
 *  ("matched keyword: agents", "visited during a rabbit hole about..."). */
export type MatchReason =
  | { kind: "title" | "domain" | "url"; text: string }
  | { kind: "keyword"; keyword: string }
  | { kind: "topic"; label: string }
  | { kind: "platform"; platform: Platform }
  | { kind: "time"; text: string };

export interface SearchResult {
  event: ActivityEvent;
  relevance: number; // 0..1, internal ranking score
  reasons: MatchReason[];
  /** The topic cluster this event belongs to in the current snapshot, if any. */
  topic: { label: string; keywords: string[] } | null;
  /** The rabbit hole this event was part of, if any - real trail, not invented. */
  rabbitHole: RabbitHole | null;
}

export interface TraceBackStep {
  eventId: string;
  timestamp: number;
  title: string;
  domain: string;
  platform: Platform;
  contentType: ContentType;
}

/** The reconstructed path to a piece of content, built only from events that
 *  actually happened in the same browsing session, in the order observed. */
export interface TraceBackResult {
  targetEventId: string;
  target: TraceBackStep;
  /** Chronological steps strictly before the target, same session. Empty
   *  if the target was the first thing observed in its session. */
  steps: TraceBackStep[];
  rabbitHoleLabel: string | null;
  sessionStartedAt: number;
}

// ---- open tabs & thread rescue ("ravel a thread") ----
//
// Everything above this point describes HISTORY - pages already visited.
// This section is the live layer: tabs that are open RIGHT NOW. It exists
// so Ravel can answer "is it safe to close this?" instead of only "what did
// I read last week?" - the two halves of the same idea (a hoarded tab and a
// forgotten research trail are the same fear: closing it means losing it).

/** A currently open tab Ravel is tracking. Reconciled against chrome.tabs on
 *  every extension startup - tabIds are not stable across browser restarts,
 *  so this is rebuilt, never trusted to persist forever untouched. */
export interface OpenTab {
  tabId: number;
  windowId: number;
  url: string;
  domain: string;
  title: string;
  keywords: string[];
  openedAt: number; // when Ravel first saw this tab (best-effort on reconciliation)
  lastActiveAt: number; // last time this tab was focused, navigated, or actively read
  openerUrl?: string; // the page this tab was opened from, if any - part of its way back
}

/** What closing a tab would cost, and how to get it back (analysis/wayBack.ts). */
export interface WayBack {
  cost: "none" | "low" | "high";
  reason: string;
  recipe?: string;
}

/** A live group of open tabs sharing a topic - the popup's primary view.
 *  Recomputed on demand from OpenTab rows; never persisted itself. */
export interface OpenThread {
  label: string;
  keywords: string[];
  tabs: (OpenTab & { wayBack: WayBack })[];
  /** Tabs that would be hard to find again - ordering puts these last. */
  hardTabs: number;
  lastActiveAt: number; // most recently touched tab in the group
  quietDays: number; // days since lastActiveAt
  isStale: boolean; // quiet long enough to be a "safe to close" candidate
}

/** What's left after a thread is ravelled: the tabs actually close, this
 *  digest is what makes closing them safe. Built only from what was really
 *  open - titles, domains, time span - never invented. */
export interface Spool {
  id: string;
  label: string;
  keywords: string[];
  tabs: { url: string; title: string; domain: string; wayBack?: WayBack }[];
  openedAt: number;
  closedAt: number;
  digest: string;
}

export const DEFAULT_SETTINGS: RavelSettings = {
  platformsEnabled: {
    generic: true,
    youtube: true,
    instagram: true,
    netflix: true,
  },
  retentionDays: 90,
  trackingEnabled: true,
  staleThreadDays: 3,
  userName: "",
};

// ---- content-script <-> background message contract ----

export type RavelMessage =
  | { type: "PAGE_OBSERVED"; payload: Omit<ActivityEvent, "id" | "revisitCount" | "duration" | "sessionId"> }
  | { type: "ACTIVE_TIME_TICK"; payload: { url: string; deltaMs: number } }
  | { type: "GET_SNAPSHOT" }
  | { type: "GET_CURRENT" }
  | { type: "GET_STATS" }
  | { type: "DELETE_EVERYTHING" }
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; payload: Partial<RavelSettings> }
  | { type: "EXPORT_ALL_DATA" }
  | { type: "SEARCH_MEMORY"; payload: { query: string; filters?: SearchFilters; limit?: number } }
  | { type: "TRACE_BACK"; payload: { eventId: string } }
  | { type: "GET_OPEN_THREADS" }
  | { type: "RAVEL_THREAD"; payload: { tabIds: number[]; label: string; keywords: string[] } }
  | { type: "GET_SPOOLS" }
  | { type: "DELETE_SPOOL"; payload: { id: string } };

// ---- background -> popup/dashboard push notifications (unsolicited) ----
// Sent via chrome.runtime.sendMessage with no target tabId, so every open
// extension page (popup, dashboard) receives them while listening.

export type RavelBroadcast =
  | { type: "SNAPSHOT_UPDATED"; snapshot: RavelSnapshot }
  | { type: "CURRENT_TICK"; current: CurrentActivity | null }
  | { type: "SETTINGS_UPDATED"; settings: RavelSettings }
  | { type: "OPEN_THREADS_UPDATED"; threads: OpenThread[] };

export interface RavelSnapshot {
  now: TopicCluster | null;
  relatedTopics: TopicCluster[];
  rabbitHoles: RabbitHole[];
  generatedAt: number;
}
