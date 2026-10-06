import type { ActivityEvent, RavelSnapshot } from "../shared/types";
import { ensureKeywords } from "./topicExtraction";
import { clusterEvents } from "./clustering";
import { detectRabbitHoles } from "./rabbitHoleDetection";
import { annotateRevisits } from "./revisitDetection";

export { searchMemory } from "./search/searchEngine";
export { traceBack } from "./traceBack";
export { groupOpenTabs, buildDigest, STALE_THREAD_DAYS } from "./staleThreads";

/** Prepares events + full (untrimmed) clusters/rabbit holes - what search and
 *  trace-back need to see everything, not just the top-5 the dashboard shows. */
export function prepareForSearch(rawEvents: ActivityEvent[]) {
  const events = ensureKeywords(annotateRevisits(rawEvents));
  const clusters = clusterEvents(events);
  const rabbitHoles = detectRabbitHoles(events);
  return { events, clusters, rabbitHoles };
}

/**
 * The full deterministic pipeline, run entirely in-process (background
 * service worker or dashboard tab). No network calls, no LLM/API calls.
 * RAW ACTIVITY -> NORMALIZATION -> KEYWORDS -> CLUSTERING -> TEMPORAL/SEQUENCE ANALYSIS
 */
export function runAnalysis(rawEvents: ActivityEvent[]): RavelSnapshot {
  const withRevisits = annotateRevisits(rawEvents);
  const events = ensureKeywords(withRevisits);

  const clusters = clusterEvents(events);
  const rabbitHoles = detectRabbitHoles(events);

  const [now, ...relatedTopics] = clusters;

  return {
    now: now ?? null,
    relatedTopics: relatedTopics.slice(0, 5),
    rabbitHoles: rabbitHoles.slice(0, 5),
    generatedAt: Date.now(),
  };
}
