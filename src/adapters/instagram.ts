import type { PlatformAdapter } from "./types";
import { safeRead, safeText } from "./types";
import { extractKeywords } from "../shared/utils";
import { readOpenGraph } from "./richSignals";

/**
 * Instagram aggressively virtualizes its DOM and most content is not
 * reachable by a content script without private APIs RAVEL does not use.
 * This adapter reads: the page <title> (which Instagram sets to the
 * poster's name/handle on a post/reel view), any hashtag-shaped tokens
 * visible in on-screen text near the top of the document, and - new - 
 * Instagram's own Open Graph tags, which frequently carry a truncated
 * caption for sharing purposes and are exposed the same way to any DOM
 * reader. If Instagram's markup changes and nothing matches, this returns
 * null and the generic adapter's fallback timing/domain tracking still
 * applies - RAVEL never claims to see captions, DMs, or anything not
 * rendered on-screen to the user in that moment.
 */
export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",
  matches: (hostname) => hostname.endsWith("instagram.com"),
  read(doc, url) {
    return safeRead(() => {
      const isReel = url.includes("/reel/");
      const isPost = url.includes("/p/");
      if (!isReel && !isPost) return null;

      const title = doc.title || "Instagram post";

      // Hashtags are the most reliably-public, low-sensitivity topic
      // signal Instagram exposes in visible text.
      const bodyText = safeText(doc.body).slice(0, 2000); // bounded read
      const hashtags = (bodyText.match(/#[a-zA-Z0-9_]{2,30}/g) ?? []).slice(0, 8);

      const og = readOpenGraph(doc);

      const keywords = hashtags.length
        ? hashtags.map((h) => h.slice(1).toLowerCase())
        : extractKeywords([title, og?.description ?? ""].join(" "), 6);

      return {
        title,
        contentType: isReel ? "reel" : "page",
        keywords,
        meta: { hashtagCount: hashtags.length },
        description: og?.description,
        extraction: {
          sources: [
            ...(hashtags.length ? (["platform-dom"] as const) : []),
            ...(og ? (["open-graph"] as const) : []),
            ...(!hashtags.length && !og ? (["title-tag"] as const) : []),
          ],
          confidence: hashtags.length && og ? 0.4 : hashtags.length || og ? 0.25 : 0.1,
        },
      };
    });
  },
};
