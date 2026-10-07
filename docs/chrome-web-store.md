# Chrome Web Store submission

Everything the listing form asks for, ready to paste. Submitting needs a
developer account (one-time $5) at https://chrome.google.com/webstore/devconsole.

Upload: `npm run build`, then zip the *contents* of `dist_pkg/` (manifest.json at the zip root).

## Listing

**Name:** Ravel

**Summary (132 chars max):**
Closing a tab feels like losing it. Ravel flags the tabs you've stopped using and keeps them findable after they close. Local only.

**Description:**
Closing a tab feels like losing it, so the tabs pile up.

Ravel groups your open tabs into threads by the words and sites they share, notices which threads you haven't touched in days, and lets you close one with a single click. Every title and address it held is kept as a spool you can search and reopen.

- Day one: tab ages come from the browser itself, so tabs that were already gathering dust are flagged the day you install.
- Nothing closes on its own. Ravel only suggests.
- Search by any word from a page's title, site or address, plus a time like "last week".
- Everything stays in this browser. No account, no server, no network requests.
- Free and open source (MIT): https://github.com/MithunSidhaarth/ravel-extension

Way Back: other tab tools ask how long since you looked at a tab. Ravel asks what closing it would cost you. Copies and searches you've already refined are offered first, and every closed tab keeps the exact way back to it.

**Category:** Productivity → Tools

## Privacy tab

**Single purpose:** Help the user safely close browser tabs they no longer use, by grouping open tabs and keeping a searchable local record of the ones they close.

**Permission justifications:**
- `tabs`: read open tabs' titles and URLs to group them into threads, and close the tabs the user chooses to ravel.
- `alarms`: re-run local grouping periodically and prune old local records past the user's retention setting.
- `scripting`: register the optional page reader only after the user turns it on in Settings and grants host access.
- Optional host permission `http://*/*`, `https://*/*`: requested only when the user enables "Read page descriptions"; reads the page's own description meta tags and active reading time.

**Remote code:** No. All code ships in the package; the CSP is `script-src 'self'`.

**Data usage:** Collects web history (titles, URLs, timestamps) and, if page access is on, website content (description tags). Stored only in the browser's IndexedDB. Not sold, not transferred, not used for anything but the single purpose. Check all three certification boxes.

**Privacy policy URL:** https://ravel.runs-on.dev/privacy
