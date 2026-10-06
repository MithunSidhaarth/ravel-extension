import type { ActivityEvent, TopicCluster } from "../shared/types";
import { keywordSimilarity, uid, titleCase } from "../shared/utils";

const SIMILARITY_THRESHOLD = 0.28;

/** Single source of truth for how a freshly-formed cluster gets its label. */
export function autoLabel(keywords: string[], domain: string): string {
  return titleCase(keywords[0] ?? domain);
}

/**
 * Greedy incremental clustering: walk events oldest -> newest, attach
 * each to the most similar existing cluster if above threshold, else
 * start a new cluster. Deterministic, O(n * clusters), no ML model.
 */
export function clusterEvents(events: ActivityEvent[]): TopicCluster[] {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const clusters: TopicCluster[] = [];

  for (const event of sorted) {
    const kw = event.keywords ?? [];
    let best: { cluster: TopicCluster; score: number } | null = null;

    for (const cluster of clusters) {
      const score = keywordSimilarity(kw, cluster.keywords);
      if (score > SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { cluster, score };
      }
    }

    if (best) {
      const c = best.cluster;
      c.eventIds.push(event.id);
      c.sites.push({ id: event.id, title: event.title, domain: event.domain });
      c.lastSeen = Math.max(c.lastSeen, event.timestamp);
      c.firstSeen = Math.min(c.firstSeen, event.timestamp);
      c.totalDuration += event.duration;
      // merge keyword sets, keep the most frequent-looking ones bounded
      c.keywords = [...new Set([...c.keywords, ...kw])].slice(0, 10);
    } else {
      clusters.push({
        id: uid(),
        label: autoLabel(kw, event.domain),
        keywords: kw,
        eventIds: [event.id],
        sites: [{ id: event.id, title: event.title, domain: event.domain }],
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        totalDuration: event.duration,
        score: 0,
      });
    }
  }

  // score = recency-weighted duration, used to pick "NOW"
  const now = Date.now();
  for (const c of clusters) {
    const ageHours = (now - c.lastSeen) / (1000 * 60 * 60);
    const recencyWeight = Math.max(0, 1 - ageHours / 72); // decays over 3 days
    c.score = c.totalDuration * (0.2 + 0.8 * recencyWeight);
  }

  return clusters.sort((a, b) => b.score - a.score);
}
