import type { ActivityEvent, RabbitHole, TopicCluster } from "../../shared/types";

/** The topic + rabbit-hole context an event belongs to, pulled from an
 *  already-computed snapshot. Read-only lookups - no new inference here. */
export interface EventContext {
  topic: TopicCluster | null;
  rabbitHole: RabbitHole | null;
}

export function buildContextIndex(clusters: TopicCluster[], rabbitHoles: RabbitHole[]) {
  const topicByEventId = new Map<string, TopicCluster>();
  for (const c of clusters) for (const id of c.eventIds) topicByEventId.set(id, c);

  const holeByEventId = new Map<string, RabbitHole>();
  for (const h of rabbitHoles) for (const id of h.eventIds) holeByEventId.set(id, h);

  return {
    contextFor(eventId: string): EventContext {
      return {
        topic: topicByEventId.get(eventId) ?? null,
        rabbitHole: holeByEventId.get(eventId) ?? null,
      };
    },
  };
}

/** Real, observed adjacency only: was there an earlier event in the same
 *  session? Used both for search's "how" filter and for explaining a result. */
export function priorSameSessionEvent(event: ActivityEvent, allEvents: ActivityEvent[]): ActivityEvent | null {
  let best: ActivityEvent | null = null;
  for (const e of allEvents) {
    if (e.sessionId !== event.sessionId || e.id === event.id) continue;
    if (e.timestamp >= event.timestamp) continue;
    if (!best || e.timestamp > best.timestamp) best = e;
  }
  return best;
}
