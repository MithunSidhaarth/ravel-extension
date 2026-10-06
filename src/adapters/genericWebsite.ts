import type { PlatformAdapter } from "./types";
import { safeRead, safeText } from "./types";
import { extractKeywords } from "../shared/utils";
import { collectRichSignals } from "./richSignals";
import type { ContentType } from "../shared/types";

/** Maps a loose schema.org/OG type string to RAVEL's small ContentType enum.
 *  Falls back to "page"/"article" rather than guessing at anything fancier. */
function mapContentType(hint: string | undefined): ContentType {
  if (!hint) return "page";
  const h = hint.toLowerCase();
  if (h.includes("video")) return "video";
  if (h.includes("article") || h.includes("newsarticle") || h.includes("blogposting")) return "article";
  return "page";
}

/**
 * Reads, in priority order: schema.org JSON LD, Open Graph tags, the meta
 * description tag, page headings, and - only if nothing structured exists - 
 * a bounded, noise-filtered read of the visible body text. document.title
 * and the URL are the final fallback, never the starting point. Nothing
 * beyond what collectRichSignals() documents is touched.
 */
export const genericWebsiteAdapter: PlatformAdapter = {
  platform: "generic",
  matches: () => true, // fallback adapter - always matches
  read(doc) {
    return safeRead(() => {
      const rich = collectRichSignals(doc);
      const title =
        doc.title || safeText(doc.querySelector("h1")) || "Untitled page";

      const keywordSourceText = [title, rich.description ?? "", rich.keywords.join(" ")]
        .filter(Boolean)
        .join(" ");
      const keywords = extractKeywords(keywordSourceText, 8);

      const usedFallback = rich.sources.length === 0;
      const sources = usedFallback ? ["title-tag" as const] : rich.sources;

      return {
        title,
        contentType: mapContentType(rich.contentTypeHint),
        keywords,
        description: rich.description,
        extraction: { sources: [...sources], confidence: usedFallback ? 0.1 : rich.confidence },
      };
    });
  },
};
