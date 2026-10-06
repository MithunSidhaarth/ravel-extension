// RAVEL - pure helpers. No side effects, no network, no chrome.* calls.

export function uid(): string {
  return crypto.randomUUID();
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

const STOPWORDS = new Set(
  "the a an and or but if of to in on for with is are was were be been being this that these those it its as at by from into out up down over under again further than then once here there all any both each few more most other some such no nor not only own same so too very s t can will just don should now watch video official ft feat".split(
    " "
  )
);

/** Cheap local keyword extraction - no model, no network. */
export function extractKeywords(text: string, max = 6): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

/** Cosine similarity between two keyword sets (bag-of-words, unweighted). */
export function keywordSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const shared = [...setA].filter((k) => setB.has(k)).length;
  return shared / Math.sqrt(setA.size * setB.size);
}

export function daysBetween(a: number, b: number): number {
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Compact duration for the extension icon badge - badge space is ~4 chars. */
export function formatBadgeDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}
