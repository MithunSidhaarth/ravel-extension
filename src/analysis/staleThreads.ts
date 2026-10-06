import type { OpenTab, OpenThread } from "../shared/types";
import { keywordSimilarity, titleCase, daysBetween } from "../shared/utils";

const SIMILARITY_THRESHOLD = 0.28; // same bar as historical clustering.ts
export const STALE_THREAD_DAYS = 3; // untouched this long while still open = a rescue candidate

/**
 * Groups currently open tabs by topic using the same greedy keyword-overlap
 * approach as historical clustering (clustering.ts) - deterministic, no ML,
 * cheap enough to rerun on every tab event. A tab with no observed keywords
 * yet (content script hasn't reported) falls back to its own domain, so it
 * still lands in a sane group instead of an empty one.
 */
export function groupOpenTabs(tabs: OpenTab[], staleThreadDays: number = STALE_THREAD_DAYS): OpenThread[] {
  const groups: { keywords: string[]; tabs: OpenTab[] }[] = [];

  for (const tab of tabs) {
    const kw = tab.keywords.length > 0 ? tab.keywords : [tab.domain];
    let best: { g: (typeof groups)[number]; score: number } | null = null;
    for (const g of groups) {
      const score = keywordSimilarity(kw, g.keywords);
      if (score > SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { g, score };
      }
    }
    if (best) {
      best.g.tabs.push(tab);
      best.g.keywords = [...new Set([...best.g.keywords, ...kw])].slice(0, 10);
    } else {
      groups.push({ keywords: kw, tabs: [tab] });
    }
  }

  const now = Date.now();
  const threads: OpenThread[] = groups.map((g) => {
    const lastActiveAt = Math.max(...g.tabs.map((t) => t.lastActiveAt));
    const quietDays = Math.round(daysBetween(now, lastActiveAt) * 10) / 10;
    return {
      label: titleCase(g.keywords[0] ?? g.tabs[0]?.domain ?? "untitled"),
      keywords: g.keywords,
      tabs: [...g.tabs].sort((a, b) => b.lastActiveAt - a.lastActiveAt),
      lastActiveAt,
      quietDays,
      isStale: quietDays >= staleThreadDays,
    };
  });

  // Longest-quiet first - the rescue candidates lead, not the thread you're
  // looking at right now (that one doesn't need rescuing).
  return threads.sort((a, b) => b.quietDays - a.quietDays);
}

/** Plain-language digest of a thread at the moment it's ravelled - built only
 *  from what was actually open (titles, domains, tab count), never invented.
 *  This sentence is the entire justification for why closing was safe. */
export function buildDigest(tabs: OpenTab[], label: string): string {
  const domains = [...new Set(tabs.map((t) => t.domain))];
  const span =
    tabs.length > 1
      ? `${tabs.length} tabs across ${domains.length} site${domains.length === 1 ? "" : "s"}`
      : `1 tab on ${domains[0] ?? "unknown"}`;
  const sample = tabs
    .slice(0, 3)
    .map((t) => t.title || t.domain)
    .join("; ");
  return `${label}: ${span}. ${sample}${tabs.length > 3 ? ", and more" : ""}.`;
}
