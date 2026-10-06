import type { ContentType, ExtractionSource, Platform } from "../shared/types";

/** What one adapter is allowed to report about the current page. */
export interface PageSignal {
  title: string;
  contentType: ContentType;
  keywords: string[];
  meta?: Record<string, string | number | undefined>;
  /** Short semantic summary, when a real on-page signal provided one
   *  (Open Graph, schema.org, or a meta description tag). Never invented. */
  description?: string;
  /** Which real signals contributed, and how much confidence that implies.
   *  Optional so adapters that haven't been upgraded yet still compile;
   *  absence just means "confidence unknown," not "zero confidence." */
  extraction?: { sources: ExtractionSource[]; confidence: number };
}

export interface PlatformAdapter {
  platform: Platform;
  /** Returns true if this adapter should handle the current hostname. */
  matches(hostname: string): boolean;
  /**
   * Reads whatever the page's own DOM exposes. Must never throw - 
   * wrap the body in safeRead(). Must never read page content beyond
   * what is listed in this file's comments for that adapter.
   */
  read(doc: Document, url: string): PageSignal | null;
}

/**
 * Every adapter.read() call MUST go through safeRead. If a platform
 * changes its markup, RAVEL degrades to "we saw a page" rather than
 * throwing or, worse, guessing at private data.
 */
export function safeRead(fn: () => PageSignal | null): PageSignal | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function text(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

export { text as safeText };
