import type { ActivityEvent, RabbitHole, TraceBackResult, TraceBackStep } from "../shared/types";

/**
 * Reconstructs how the user actually arrived at an event: every prior event
 * in the same browsing session, in the order observed. This is a lookup
 * over real stored data - no step is invented, and if there's no earlier
 * activity in the session, the trail is honestly empty.
 */
export function traceBack(targetEventId: string, allEvents: ActivityEvent[], rabbitHoles: RabbitHole[]): TraceBackResult | null {
  const target = allEvents.find((e) => e.id === targetEventId);
  if (!target) return null;

  const sameSession = allEvents
    .filter((e) => e.sessionId === target.sessionId)
    .sort((a, b) => a.timestamp - b.timestamp);

  const targetIndex = sameSession.findIndex((e) => e.id === targetEventId);
  const before = targetIndex > 0 ? sameSession.slice(0, targetIndex) : [];

  const steps: TraceBackStep[] = before.map((e) => ({
    eventId: e.id,
    timestamp: e.timestamp,
    title: e.title,
    domain: e.domain,
    platform: e.platform,
    contentType: e.contentType,
  }));

  const hole = rabbitHoles.find((h) => h.eventIds.includes(targetEventId));

  return {
    targetEventId,
    target: {
      eventId: target.id,
      timestamp: target.timestamp,
      title: target.title,
      domain: target.domain,
      platform: target.platform,
      contentType: target.contentType,
    },
    steps,
    rabbitHoleLabel: hole?.label ?? null,
    sessionStartedAt: sameSession[0]?.timestamp ?? target.timestamp,
  };
}
