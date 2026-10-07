import type { OpenTab, OpenThread, WayBack } from "../shared/types";
import { domainFromUrl, extractKeywords, stem } from "../shared/utils";

// "Way back": what closing a tab would actually cost you. Every other tab
// tool decides by idle time; this decides by loss. Built only from what
// Ravel already holds locally (URL, title, opener, how often you visit a
// site) - no network, no model. Three answers:
//   none - another open tab already covers it (duplicate, or a search you
//          have since refined). Closing it loses nothing, today.
//   low  - one search or one address gets it back; that recipe is saved.
//   high - its state lives only in this address (a filtered view) or its
//          title is too generic to search for; the address and the page it
//          was opened from are saved.

const SEARCH_PARAMS = ["q", "query", "search_query", "k", "p", "text"];
const NOISE_PARAM = /^(utm_|fbclid$|gclid$|ref$|ref_src$|si$|feature$|source$|sca_esv$|ei$|ved$)/;
const OFTEN_VISITED = 5;

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Address with fragment, trailing slash and tracking noise removed. */
function normalize(url: string): string {
  const u = parse(url);
  if (!u) return url;
  for (const k of [...u.searchParams.keys()]) if (NOISE_PARAM.test(k)) u.searchParams.delete(k);
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}

/** The words of a search, if this URL is a search results page. */
export function searchTerms(url: string): string[] | null {
  const u = parse(url);
  for (const p of SEARCH_PARAMS) {
    const v = u?.searchParams.get(p)?.trim().toLowerCase();
    if (v) return v.split(/\s+/).map(stem);
  }
  return null;
}

export function assessWayBack(tab: OpenTab, all: OpenTab[], domainVisits: Map<string, number>): WayBack {
  const u = parse(tab.url);
  if (!u) return { cost: "high", reason: "its address can't be read" };
  const key = normalize(tab.url);

  // Only the older copy is "covered", so two copies never both say so.
  const twin = all.find(
    (o) =>
      o.tabId !== tab.tabId &&
      normalize(o.url) === key &&
      (o.lastActiveAt > tab.lastActiveAt || (o.lastActiveAt === tab.lastActiveAt && o.tabId > tab.tabId))
  );
  if (twin) return { cost: "none", reason: "it's also open in another tab" };

  const terms = searchTerms(tab.url);
  if (terms) {
    const refined = all.find((o) => {
      if (o.tabId === tab.tabId || o.openedAt <= tab.openedAt || parse(o.url)?.hostname !== u.hostname) return false;
      const later = searchTerms(o.url);
      return !!later && later.length > terms.length && terms.every((t) => later.includes(t));
    });
    if (refined) {
      return { cost: "none", reason: `you refined this search to "${searchTerms(refined.url)!.join(" ")}"` };
    }
    return { cost: "low", reason: "it's a search, so it can be run again", recipe: `search "${terms.join(" ")}" on ${tab.domain}` };
  }

  const params = [...u.searchParams.keys()].filter((k) => !NOISE_PARAM.test(k));
  if (u.pathname === "/" && params.length === 0) {
    return { cost: "low", reason: "it's a homepage", recipe: tab.domain };
  }

  const via = tab.openerUrl ? ` from ${domainFromUrl(tab.openerUrl)}` : "";
  if (params.length > 0) {
    return { cost: "high", reason: "its filters live only in this address", recipe: `this exact address, opened${via || " directly"}` };
  }
  const words = extractKeywords(tab.title, 5);
  if (words.length < 3) {
    return { cost: "high", reason: "its title is too vague to search for", recipe: `this exact address, opened${via || " directly"}` };
  }
  const recipe = `search "${words.join(" ")}" on ${tab.domain}`;
  if ((domainVisits.get(tab.domain) ?? 0) >= OFTEN_VISITED) {
    return { cost: "low", reason: `you're on ${tab.domain} often`, recipe };
  }
  return { cost: "low", reason: "its title is specific enough to search for", recipe };
}

/** One line on what closing this thread would cost - shown on every row. */
export function threadLossLine(thread: OpenThread): string {
  if (thread.tabs.every((t) => t.wayBack.cost === "none")) return "nothing to lose, all covered";
  if (thread.hardTabs === 0) return "easy to find again";
  return `${thread.hardTabs} hard to find again, way back kept`;
}

/** Tabs across every thread that another open tab already covers. */
export function coveredTabs(threads: OpenThread[]): OpenThread["tabs"] {
  return threads.flatMap((t) => t.tabs.filter((tab) => tab.wayBack.cost === "none"));
}

/** A tab's way back, in words. */
export function wayBackText(w: WayBack): string {
  if (w.cost === "none") return `Nothing to lose: ${w.reason}.`;
  const label = w.cost === "high" ? "Hard to find again" : "Easy to find again";
  return `${label}: ${w.reason}.${w.recipe ? ` Way back: ${w.recipe}.` : ""}`;
}
