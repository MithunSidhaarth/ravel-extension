import type { ActivityEvent, RabbitHole } from "../shared/types";
import { keywordSimilarity, uid, titleCase } from "../shared/utils";

const MAX_GAP_MS = 12 * 60 * 1000; // 12 minutes of silence breaks a trail
const MIN_TRAIL_LENGTH = 3;
const MIN_TRAIL_DURATION_MS = 8 * 60 * 1000; // 8 minutes

/**
 * A rabbit hole is a temporally-contiguous, topically-continuous trail:
 * each step must follow the previous one within MAX_GAP_MS AND share
 * enough keyword overlap with at least one recent step in the trail.
 */
export function detectRabbitHoles(events: ActivityEvent[]): RabbitHole[] {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const holes: RabbitHole[] = [];
  let trail: ActivityEvent[] = [];

  const flush = () => {
    if (trail.length >= MIN_TRAIL_LENGTH) {
      const start = trail[0].timestamp;
      const end = trail[trail.length - 1].timestamp + trail[trail.length - 1].duration;
      const duration = end - start;
      if (duration >= MIN_TRAIL_DURATION_MS) {
        const allKeywords = trail.flatMap((e) => e.keywords ?? []);
        const label = titleCase(mostCommon(allKeywords) ?? trail[0].domain);
        holes.push({
          id: uid(),
          label,
          startTime: start,
          endTime: end,
          duration,
          eventIds: trail.map((e) => e.id),
          trail: trail.map((e) => ({ id: e.id, title: e.title, domain: e.domain })),
        });
      }
    }
    trail = [];
  };

  for (const event of sorted) {
    if (trail.length === 0) {
      trail.push(event);
      continue;
    }
    const prev = trail[trail.length - 1];
    const gap = event.timestamp - (prev.timestamp + prev.duration);
    const related = trail
      .slice(-3)
      .some((e) => keywordSimilarity(e.keywords ?? [], event.keywords ?? []) > 0.15);

    if (gap <= MAX_GAP_MS && related) {
      trail.push(event);
    } else {
      flush();
      trail.push(event);
    }
  }
  flush();

  return holes.sort((a, b) => b.startTime - a.startTime);
}

function mostCommon(words: string[]): string | undefined {
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
