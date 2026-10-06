import type { ActivityEvent, MatchReason } from "../../shared/types";
import type { ParsedQuery } from "./queryParser";
import type { EventContext } from "./contextRetrieval";
import { keywordSimilarity } from "../../shared/utils";

export interface ScoredEvent {
  relevance: number;
  reasons: MatchReason[];
}

const WEIGHTS = {
  titleToken: 0.30,
  descriptionToken: 0.12,
  domainToken: 0.16,
  urlToken: 0.09,
  keywordOverlap: 0.34,
  topicOverlap: 0.16,
  platform: 0.14,
  time: 0.12,
  hourOfDay: 0.06,
};

/**
 * Deterministic local ranking - no embeddings, no network. Every score
 * component is directly explainable, which is what backs the "why this
 * may be it" reasons shown to the user.
 */
export function scoreEvent(event: ActivityEvent, query: ParsedQuery, ctx: EventContext): ScoredEvent {
  let score = 0;
  const reasons: MatchReason[] = [];

  const titleLower = event.title.toLowerCase();
  const domainLower = event.domain.toLowerCase();
  const urlLower = event.url.toLowerCase();
  const descriptionLower = (event.description ?? "").toLowerCase();

  // A single decent title hit is already a real signal on its own - the old
  // curve (hits/3) undervalued it so badly that a one-word query matching
  // the title outright still landed below the relevance floor and got
  // silently dropped. Give the first hit most of the credit; extra hits
  // just top it off.
  const titleHits = query.tokens.filter((t) => t.length > 2 && titleLower.includes(t));
  if (titleHits.length > 0) {
    score += WEIGHTS.titleToken * Math.min(1, 0.55 + titleHits.length / 5);
    reasons.push({ kind: "title", text: event.title });
  }

  // Open Graph / schema.org / meta-description text - real extracted
  // signal (see ActivityEvent.description), previously collected but
  // never actually searched.
  if (descriptionLower) {
    const descHits = query.tokens.filter((t) => t.length > 2 && descriptionLower.includes(t));
    if (descHits.length > 0) {
      score += WEIGHTS.descriptionToken * Math.min(1, 0.5 + descHits.length / 5);
      if (!titleHits.length) reasons.push({ kind: "title", text: event.title });
    }
  }

  const domainHits = query.tokens.filter((t) => t.length > 2 && domainLower.includes(t));
  if (domainHits.length > 0) {
    score += WEIGHTS.domainToken;
    reasons.push({ kind: "domain", text: event.domain });
  }

  const urlHits = query.tokens.filter((t) => t.length > 3 && urlLower.includes(t));
  if (urlHits.length > 0) {
    score += WEIGHTS.urlToken;
    // previously silent: a url-only match scored points but never added a
    // reason, so it was thrown away by the reasons.length===0 guard below
    // no matter how it scored.
    reasons.push({ kind: "url", text: event.url });
  }

  const eventKeywords = event.keywords ?? [];
  const kwSim = keywordSimilarity(query.keywords, eventKeywords);
  if (kwSim > 0) {
    score += WEIGHTS.keywordOverlap * Math.min(1, kwSim * 2);
    for (const k of query.keywords) {
      if (eventKeywords.includes(k)) reasons.push({ kind: "keyword", keyword: k });
    }
  }

  if (ctx.topic) {
    const topicSim = Math.max(
      keywordSimilarity(query.keywords, ctx.topic.keywords),
      query.keywords.some((k) => ctx.topic!.label.toLowerCase().includes(k)) ? 0.5 : 0
    );
    if (topicSim > 0.1) {
      score += WEIGHTS.topicOverlap * Math.min(1, topicSim);
      reasons.push({ kind: "topic", label: ctx.topic.label });
    }
  }

  if (query.platform && event.platform === query.platform) {
    score += WEIGHTS.platform;
    reasons.push({ kind: "platform", platform: event.platform });
  }

  if (query.time) {
    if (event.timestamp >= query.time.fromMs && event.timestamp <= query.time.toMs) {
      score += WEIGHTS.time;
      reasons.push({ kind: "time", text: query.time.label });
    } else {
      // outside the requested window is a real signal against the match,
      // not just "no bonus" - otherwise "3 weeks ago" barely outranks "today"
      score -= WEIGHTS.time * 0.5;
    }
  }

  if (query.hourRange) {
    const hour = new Date(event.timestamp).getHours();
    const { from, to } = query.hourRange;
    const inRange = from > to ? hour >= from || hour <= to : hour >= from && hour <= to;
    if (inRange) score += WEIGHTS.hourOfDay;
  }

  return { relevance: Math.max(0, Math.min(1, score)), reasons };
}
