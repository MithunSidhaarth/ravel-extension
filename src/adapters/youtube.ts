import type { PlatformAdapter } from "./types";
import { safeRead, safeText } from "./types";
import { extractKeywords } from "../shared/utils";
import { collectRichSignals } from "./richSignals";

/**
 * Reads what YouTube's own page already renders for any viewer: the video
 * title, channel name, and - new - the visible description text and
 * whatever schema.org VideoObject / Open Graph data YouTube embeds for its
 * own SEO (also visible to any DOM reader, not a private API). Does not
 * touch watch history, recommendations, or account data - those are never
 * exposed to a content script and RAVEL does not attempt to access them.
 */
export const youtubeAdapter: PlatformAdapter = {
  platform: "youtube",
  matches: (hostname) => hostname.endsWith("youtube.com"),
  read(doc, url) {
    return safeRead(() => {
      const isWatch = url.includes("/watch");
      const isShorts = url.includes("/shorts/");
      if (!isWatch && !isShorts) return null;

      const title =
        safeText(doc.querySelector("h1.ytd-watch-metadata")) ||
        safeText(doc.querySelector("h1.title")) ||
        doc.title.replace(/ - YouTube$/, "");

      const channel = safeText(
        doc.querySelector("ytd-channel-name a") ?? doc.querySelector("#channel-name a")
      );

      // Visible description panel - collapsed or expanded, both render the
      // full text into the DOM; only .textContent is read, never an API.
      const description = safeText(
        doc.querySelector("#description-inline-expander") ??
          doc.querySelector("ytd-watch-metadata #description")
      ).slice(0, 600);

      // schema.org VideoObject + Open Graph tags YouTube ships for its own
      // SEO fill in gaps (genre-ish keywords) when the description panel
      // hasn't rendered yet or the layout has shifted.
      const rich = collectRichSignals(doc);

      const finalDescription = description || rich.description;
      const keywordText = [title, channel, finalDescription ?? "", rich.keywords.join(" ")]
        .filter(Boolean)
        .join(" ");
      const keywords = extractKeywords(keywordText, 8);

      const sources = [
        ...(description ? (["platform-dom"] as const) : []),
        ...rich.sources,
      ];

      return {
        title: title || "YouTube video",
        contentType: isShorts ? "reel" : "video",
        keywords,
        meta: { channel: channel || undefined },
        description: finalDescription || undefined,
        extraction: {
          sources: sources.length ? sources : ["title-tag"],
          confidence: sources.length ? Math.max(rich.confidence, description ? 0.25 : 0) : 0.1,
        },
      };
    });
  },
};
