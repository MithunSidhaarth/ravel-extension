// RAVEL - rich, cross-platform DOM signal extraction.
//
// Everything here reads ONLY properties/tags/text a page's own document
// already exposes to any viewer via standard DOM APIs - no network
// requests, no private platform APIs, no reading of forms/inputs/cookies/
// localStorage. Every reader is individually bounded and fails soft (null
// or empty), because one missing tag must never break extraction for the
// rest of the page.
import type { ExtractionSource } from "../shared/types";

const MAX_TEXT_LEN = 600; // description-length signals
const MAX_BODY_LEN = 2000; // bounded body-text read, matches existing IG pattern

export interface RichSignal {
  description?: string;
  keywords: string[]; // additional keyword-worthy terms this source contributed
  contentTypeHint?: string; // raw schema.org @type / og:type, if any - adapters map this
  source: ExtractionSource;
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max).trim() : t;
}

function metaContent(doc: Document, selector: string): string {
  return (doc.querySelector(selector)?.getAttribute("content") ?? "").trim();
}

/** Open Graph tags - one of the most reliable, widely-adopted semantic signals. */
export function readOpenGraph(doc: Document): RichSignal | null {
  const title = metaContent(doc, 'meta[property="og:title"]');
  const description = metaContent(doc, 'meta[property="og:description"]');
  const type = metaContent(doc, 'meta[property="og:type"]');
  if (!title && !description) return null;

  return {
    description: description ? clip(description, MAX_TEXT_LEN) : undefined,
    keywords: [],
    contentTypeHint: type || undefined,
    source: "open-graph",
  };
}

/** schema.org JSON-LD - structured data authors embed for search engines.
 *  Each <script> block is parsed independently and skipped on failure, so
 *  one malformed block never takes out the rest of the page's data. */
export function readSchemaOrg(doc: Document): RichSignal | null {
  const blocks = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).slice(0, 5);
  for (const block of blocks) {
    try {
      const raw = JSON.parse(block.textContent ?? "");
      const nodes = Array.isArray(raw) ? raw : raw["@graph"] ?? [raw];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const description: string | undefined = node.description || node.about?.description;
        const type: string | undefined = Array.isArray(node["@type"]) ? node["@type"][0] : node["@type"];
        const keywordsField = node.keywords;
        const keywords = Array.isArray(keywordsField)
          ? keywordsField.map(String)
          : typeof keywordsField === "string"
          ? keywordsField.split(",").map((k: string) => k.trim())
          : [];
        const genre = typeof node.genre === "string" ? [node.genre] : Array.isArray(node.genre) ? node.genre : [];
        const author = node.author?.name || (Array.isArray(node.author) ? node.author[0]?.name : undefined);

        if (description || type || keywords.length || genre.length) {
          return {
            description: description ? clip(String(description), MAX_TEXT_LEN) : undefined,
            keywords: [...keywords, ...genre, ...(author ? [author] : [])].filter(Boolean).slice(0, 10),
            contentTypeHint: type,
            source: "schema-org",
          };
        }
      }
    } catch {
      // malformed JSON-LD - skip this block, try the next
      continue;
    }
  }
  return null;
}

/** Plain <meta name="description">, the oldest and most universal fallback. */
export function readMetaDescription(doc: Document): RichSignal | null {
  const description = metaContent(doc, 'meta[name="description"]');
  if (!description) return null;
  return { description: clip(description, MAX_TEXT_LEN), keywords: [], source: "meta-description" };
}

/** First couple of real headings - cheap topic signal when nothing richer exists. */
export function readHeadings(doc: Document): RichSignal | null {
  const headings = Array.from(doc.querySelectorAll("h1, h2"))
    .slice(0, 4)
    .map((el) => (el.textContent ?? "").trim())
    .filter(Boolean);
  if (headings.length === 0) return null;
  return { keywords: headings.join(" ").split(/\s+/).slice(0, 20), source: "heading" };
}

/** Bounded, noise-filtered body text - last resort before giving up on
 *  semantic content. Strips nav/header/footer/aside/script/style/ads
 *  from a CLONE of the DOM (never mutates the live page) before reading,
 *  so chrome/boilerplate doesn't drown out the actual content. */
export function readReadableBody(doc: Document): RichSignal | null {
  if (!doc.body) return null;
  const clone = doc.body.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("nav, header, footer, aside, script, style, noscript, iframe, [role='navigation'], [aria-hidden='true'], .ad, [class*='cookie'], [class*='banner']")
    .forEach((el) => el.remove());

  const main = clone.querySelector("main, article") ?? clone;
  const text = (main.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  return { keywords: [], description: clip(text, MAX_BODY_LEN), source: "body-text" };
}

/**
 * Runs every reader in priority order and merges what real signals exist.
 * Nothing here is invented: a source that finds nothing simply contributes
 * nothing, and the merged result is only as rich as what the page actually
 * exposed. Confidence reflects how many independent real signals corroborate
 * each other, not any judgment about the content itself.
 */
export function collectRichSignals(doc: Document): {
  description?: string;
  keywords: string[];
  contentTypeHint?: string;
  sources: ExtractionSource[];
  confidence: number;
} {
  const readers = [readSchemaOrg, readOpenGraph, readMetaDescription, readHeadings, readReadableBody];
  const sources: ExtractionSource[] = [];
  let description: string | undefined;
  let contentTypeHint: string | undefined;
  const keywords: string[] = [];

  for (const read of readers) {
    const result = read(doc);
    if (!result) continue;
    sources.push(result.source);
    if (!description && result.description) description = result.description;
    if (!contentTypeHint && result.contentTypeHint) contentTypeHint = result.contentTypeHint;
    keywords.push(...result.keywords);
  }

  const confidence = scoreConfidence(sources);
  return { description, keywords, contentTypeHint, sources, confidence };
}

/** Confidence grows with independent, higher-quality corroborating
 *  signals - structured data counts for more than raw body text - and is
 *  capped well short of 1.0 since RAVEL never claims certainty about a
 *  human's intent from page content alone. */
function scoreConfidence(sources: ExtractionSource[]): number {
  const WEIGHT: Record<ExtractionSource, number> = {
    "schema-org": 0.35,
    "open-graph": 0.25,
    "platform-dom": 0.25,
    "meta-description": 0.15,
    heading: 0.1,
    "body-text": 0.08,
    "title-tag": 0.05,
    "url-fallback": 0.02,
  };
  if (sources.length === 0) return 0.1; // title-only, nothing else corroborated
  const raw = sources.reduce((sum, s) => sum + (WEIGHT[s] ?? 0), 0.15);
  return Math.min(0.95, Math.round(raw * 100) / 100);
}
