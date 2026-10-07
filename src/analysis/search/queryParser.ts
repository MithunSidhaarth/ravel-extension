import type { Platform } from "../../shared/types";
import { extractKeywords, stem } from "../../shared/utils";

export interface ParsedQuery {
  raw: string;
  /** Meaningful tokens (stopwords stripped), used for keyword-set matching. */
  keywords: string[];
  /** Every lowercased word in the query, used for direct substring/token matching
   *  against titles/domains - including short words extractKeywords would drop. */
  tokens: string[];
  /** A platform explicitly named in the query text, if any ("...on Instagram"). */
  platform: Platform | null;
  /** A rough time window implied by phrasing like "a few weeks ago" or "last night". */
  time: { fromMs: number; toMs: number; label: string } | null;
  /** "at night" / "late at night" - an hour-of-day range, independent of date. */
  hourRange: { from: number; to: number } | null;
}

const PLATFORM_WORDS: Record<string, Platform> = {
  youtube: "youtube",
  instagram: "instagram",
  insta: "instagram",
  netflix: "netflix",
  reel: "instagram",
  reels: "instagram",
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Deterministic, local, no-network query understanding. Good enough to turn
 * "that AI website I saw at night a few weeks ago" into: keywords ["ai","website"],
 * hourRange [22,5], time window ~2-6 weeks ago. Never guesses at meaning beyond
 * what the phrasing directly supports.
 */
export function parseQuery(raw: string): ParsedQuery {
  const lower = raw.toLowerCase();
  const now = Date.now();

  let platform: Platform | null = null;
  for (const [word, p] of Object.entries(PLATFORM_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) {
      platform = p;
      break;
    }
  }
  // "website" / "site" as a platform hint means "generic" (not YouTube/IG/Netflix)
  if (!platform && /\b(website|site|webpage)\b/.test(lower)) platform = "generic";

  let time: ParsedQuery["time"] = null;
  if (/\btoday\b/.test(lower)) {
    time = { fromMs: now - DAY, toMs: now, label: "today" };
  } else if (/\byesterday\b/.test(lower)) {
    time = { fromMs: now - 2 * DAY, toMs: now - DAY, label: "yesterday" };
  } else if (/\blast week\b|\bthis week\b/.test(lower)) {
    time = { fromMs: now - 7 * DAY, toMs: now, label: "this week" };
  } else if (/\blast month\b|\bthis month\b/.test(lower)) {
    time = { fromMs: now - 31 * DAY, toMs: now, label: "this month" };
  } else {
    const weeksAgo = lower.match(/(\d+)\s*weeks?\s*ago/);
    const daysAgo = lower.match(/(\d+)\s*days?\s*ago/);
    const monthsAgo = lower.match(/(\d+)\s*months?\s*ago/);
    const fewWeeks = /\ba few weeks ago\b/.test(lower);
    const fewDays = /\ba few days ago\b/.test(lower);
    const fewMonths = /\ba few months ago\b/.test(lower);

    if (daysAgo) {
      const d = Number(daysAgo[1]);
      time = { fromMs: now - (d + 2) * DAY, toMs: now - Math.max(d - 2, 0) * DAY, label: `~${d} days ago` };
    } else if (weeksAgo) {
      const w = Number(weeksAgo[1]);
      time = {
        fromMs: now - (w * 7 + 5) * DAY,
        toMs: now - Math.max(w * 7 - 5, 0) * DAY,
        label: `~${w} week${w === 1 ? "" : "s"} ago`,
      };
    } else if (monthsAgo) {
      const m = Number(monthsAgo[1]);
      time = { fromMs: now - (m * 31 + 10) * DAY, toMs: now - Math.max(m * 31 - 10, 0) * DAY, label: `~${m} months ago` };
    } else if (fewDays) {
      time = { fromMs: now - 10 * DAY, toMs: now - 1 * DAY, label: "a few days ago" };
    } else if (fewWeeks) {
      time = { fromMs: now - 42 * DAY, toMs: now - 7 * DAY, label: "a few weeks ago" };
    } else if (fewMonths) {
      time = { fromMs: now - 150 * DAY, toMs: now - 40 * DAY, label: "a few months ago" };
    }
  }

  let hourRange: ParsedQuery["hourRange"] = null;
  if (/\b(late at night|middle of the night)\b/.test(lower)) hourRange = { from: 23, to: 4 };
  else if (/\bat night\b/.test(lower)) hourRange = { from: 21, to: 5 };
  else if (/\bmorning\b/.test(lower)) hourRange = { from: 6, to: 11 };
  else if (/\bafternoon\b/.test(lower)) hourRange = { from: 12, to: 17 };
  else if (/\bevening\b/.test(lower)) hourRange = { from: 18, to: 22 };

  // Stemmed so "apartments" still substring-matches a title saying "apartment".
  const tokens = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).map(stem);
  const keywords = extractKeywords(raw, 12);

  return { raw, keywords, tokens, platform, time, hourRange };
}
