import type { ActivityEvent } from "../shared/types";
import { extractKeywords } from "../shared/utils";

/** Ensures every event has a keyword vector, deriving one from the title if missing. */
export function ensureKeywords(events: ActivityEvent[]): ActivityEvent[] {
  return events.map((e) =>
    e.keywords && e.keywords.length > 0
      ? e
      : { ...e, keywords: extractKeywords(e.title, 6) }
  );
}
