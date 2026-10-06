import type { ActivityEvent, RabbitHole, SearchFilters, SearchResult, TopicCluster } from "../../shared/types";
import { parseQuery } from "./queryParser";
import { scoreEvent } from "./ranking";
import { buildContextIndex, priorSameSessionEvent } from "./contextRetrieval";

// Below this, a result isn't worth showing as "found". Was 0.12 - high enough
// that a single honest title-only match (previously ~0.073) got silently
// dropped. ranking.ts's curve now gives a real single hit more credit, and
// the floor itself is relaxed slightly so a lone solid domain/url match
// still counts as a find rather than noise.
const RELEVANCE_FLOOR = 0.09;

function matchesFilters(event: ActivityEvent, allEvents: ActivityEvent[], ctx: { rabbitHole: RabbitHole | null }, filters?: SearchFilters): boolean {
  if (!filters) return true;

  if (filters.platform && event.platform !== filters.platform) return false;

  if (filters.when) {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const age = now - event.timestamp;
    const withinToday = age <= DAY;
    const withinYesterday = age > DAY && age <= 2 * DAY;
    const withinWeek = age <= 7 * DAY;
    const withinMonth = age <= 31 * DAY;
    if (filters.when === "today" && !withinToday) return false;
    if (filters.when === "yesterday" && !withinYesterday) return false;
    if (filters.when === "week" && !withinWeek) return false;
    if (filters.when === "month" && !withinMonth) return false;
    if (filters.when === "earlier" && withinMonth) return false;
  }

  if (filters.how) {
    if (filters.how === "rabbitHole" && !ctx.rabbitHole) return false;
    if (filters.how === "revisited" && event.revisitCount === 0) return false;
    if (filters.how === "fresh" || filters.how === "continued") {
      const prior = priorSameSessionEvent(event, allEvents);
      const isFresh = !prior;
      if (filters.how === "fresh" && !isFresh) return false;
      if (filters.how === "continued" && isFresh) return false;
    }
  }

  return true;
}

/**
 * The real, local "what are you trying to remember?" search: no LLM, no
 * network - a deterministic pipeline over the user's own stored events.
 */
export function searchMemory(
  rawQuery: string,
  allEvents: ActivityEvent[],
  clusters: TopicCluster[],
  rabbitHoles: RabbitHole[],
  filters?: SearchFilters,
  limit = 8
): SearchResult[] {
  const query = parseQuery(rawQuery);
  const contextIndex = buildContextIndex(clusters, rabbitHoles);

  if (query.keywords.length === 0 && query.tokens.every((t) => t.length <= 2) && !query.platform && !query.time) {
    return []; // nothing meaningful to search on - don't return noise
  }

  const results: SearchResult[] = [];
  for (const event of allEvents) {
    const ctx = contextIndex.contextFor(event.id);
    if (!matchesFilters(event, allEvents, ctx, filters)) continue;

    const { relevance, reasons } = scoreEvent(event, query, ctx);
    if (relevance < RELEVANCE_FLOOR || reasons.length === 0) continue;

    results.push({
      event,
      relevance,
      reasons,
      topic: ctx.topic ? { label: ctx.topic.label, keywords: ctx.topic.keywords } : null,
      rabbitHole: ctx.rabbitHole,
    });
  }

  // dedupe near-identical URLs (e.g. re-visits of the same page), keeping the
  // strongest-scoring instance - the user is looking for "the thing", not every visit
  const byUrl = new Map<string, SearchResult>();
  for (const r of results) {
    const key = r.event.url.split("#")[0];
    const existing = byUrl.get(key);
    if (!existing || r.relevance > existing.relevance) byUrl.set(key, r);
  }

  return [...byUrl.values()].sort((a, b) => b.relevance - a.relevance).slice(0, limit);
}
