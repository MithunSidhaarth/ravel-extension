import type { PlatformAdapter } from "../adapters/types";
import { youtubeAdapter } from "../adapters/youtube";
import { instagramAdapter } from "../adapters/instagram";
import { netflixAdapter } from "../adapters/netflix";
import { genericWebsiteAdapter } from "../adapters/genericWebsite";

// Order matters: specific adapters first, generic fallback last.
const ADAPTERS: PlatformAdapter[] = [
  youtubeAdapter,
  instagramAdapter,
  netflixAdapter,
  genericWebsiteAdapter,
];

export function resolveAdapter(hostname: string): PlatformAdapter {
  return ADAPTERS.find((a) => a.matches(hostname)) ?? genericWebsiteAdapter;
}
