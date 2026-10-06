import type { PlatformAdapter } from "./types";
import { safeRead } from "./types";
import { extractKeywords } from "../shared/utils";
import { readOpenGraph, readSchemaOrg } from "./richSignals";

/**
 * Reads the page <title> (which Netflix sets to the title being watched or
 * browsed) plus, when present, Netflix's own Open Graph / schema.org tags - 
 * often carrying a synopsis and sometimes a genre - the same public SEO
 * data any page viewer's browser already receives. RAVEL never attempts to
 * read the player, subtitle tracks, or any DRM-protected content - only
 * tags and title text the browser tab itself already exposes. Netflix's
 * web app frequently omits these tags on the watch player specifically, so
 * this adapter degrades honestly to title-only when they're absent rather
 * than guessing at genre or synopsis.
 */
export const netflixAdapter: PlatformAdapter = {
  platform: "netflix",
  matches: (hostname) => hostname.endsWith("netflix.com"),
  read(doc, url) {
    return safeRead(() => {
      const isWatch = url.includes("/watch/");
      const rawTitle = doc.title.replace(/^Netflix\s*-\s*/, "").trim();
      if (!rawTitle) return null;

      const schema = readSchemaOrg(doc);
      const og = readOpenGraph(doc);
      const description = schema?.description || og?.description;
      const extraKeywords = schema?.keywords ?? [];

      return {
        title: rawTitle,
        contentType: isWatch ? "show" : "page",
        keywords: extractKeywords([rawTitle, ...extraKeywords].join(" "), 6),
        description,
        extraction: {
          sources: [
            ...(schema ? (["schema-org"] as const) : []),
            ...(og ? (["open-graph"] as const) : []),
            ...(!schema && !og ? (["title-tag"] as const) : []),
          ],
          confidence: schema ? 0.5 : og ? 0.3 : 0.1,
        },
      };
    });
  },
};
