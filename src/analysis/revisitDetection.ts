import type { ActivityEvent } from "../shared/types";

/** Mutates revisitCount on events sharing the same normalized URL. */
export function annotateRevisits(events: ActivityEvent[]): ActivityEvent[] {
  const seenCount = new Map<string, number>();
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  return sorted.map((e) => {
    const key = e.url.split("#")[0];
    const count = (seenCount.get(key) ?? 0) + 1;
    seenCount.set(key, count);
    return { ...e, revisitCount: count - 1 };
  });
}
