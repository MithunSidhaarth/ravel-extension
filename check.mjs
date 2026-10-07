// Smallest check that fails if word matching regresses. Run after `npm run build`:
//   node check.mjs
import assert from "node:assert/strict";
import { stem, keywordSimilarity, platformFor } from "./dist/shared/utils.js";
import { searchMemory } from "./dist/analysis/search/searchEngine.js";

assert.equal(stem("apartments"), "apartment");
assert.equal(stem("business"), "business");
assert.equal(stem("docs"), "docs");
assert.equal(keywordSimilarity(["apartments"], ["apartment"]), 1);
assert.equal(platformFor("www.youtube.com"), "youtube");
assert.equal(platformFor("m.youtube.com"), "youtube");
assert.equal(platformFor("example.com"), "generic");

const ev = { id: "1", timestamp: Date.now(), url: "https://streeteasy.com/x", domain: "streeteasy.com",
  title: "2BR Apartment in Fort Greene", platform: "generic", contentType: "page", sessionId: "s",
  duration: 0, revisitCount: 0, keywords: ["2br", "apartment", "fort", "greene"] };
assert.equal(searchMemory("apartments", [ev], [], []).length, 1, "plural query should find singular title");
assert.equal(searchMemory("streeteasy", [ev], [], []).length, 1, "site name should match");

// Way back: cost of closing a tab, judged from local signals only.
import { assessWayBack } from "./dist/analysis/wayBack.js";
const t = (tabId, url, title, openedAt = 1, lastActiveAt = 1, extra = {}) =>
  ({ tabId, windowId: 1, url, domain: new URL(url).hostname, title, keywords: [], openedAt, lastActiveAt, ...extra });
const none = new Map();
const s1 = t(1, "https://www.google.com/search?q=flights+nyc", "flights nyc", 1);
const s2 = t(2, "https://www.google.com/search?q=flights+nyc+jfk+march", "flights nyc jfk march", 2);
assert.equal(assessWayBack(s1, [s1, s2], none).cost, "none", "refined search covers the older one");
assert.equal(assessWayBack(s2, [s1, s2], none).cost, "low", "the newest search is rerunnable");
const d1 = t(3, "https://react.dev/learn#x", "Quick Start React", 1, 1);
const d2 = t(4, "https://react.dev/learn?utm_source=x", "Quick Start React", 1, 5);
assert.equal(assessWayBack(d1, [d1, d2], none).cost, "none", "older duplicate is covered");
assert.equal(assessWayBack(d2, [d1, d2], none).cost, "low", "newer duplicate is not");
const f = t(5, "https://zillow.com/homes?beds=2&price=3500", "Brooklyn homes for rent 2 bed", 1, 1, { openerUrl: "https://reddit.com/r/nyc" });
const fw = assessWayBack(f, [f], none);
assert.equal(fw.cost, "high", "filtered view lives only in its address");
assert.match(fw.recipe, /reddit\.com/, "way back names where it was opened from");
assert.equal(assessWayBack(t(6, "https://github.com/", "GitHub"), [], none).cost, "low", "homepage");
assert.equal(assessWayBack(t(7, "https://x.com/a/b", "Home"), [], none).cost, "high", "vague title");
console.log("ok");
