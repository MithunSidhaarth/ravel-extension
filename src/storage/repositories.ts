import { STORES, put, getAll, get, del } from "./db";
import type { ActivityEvent, OpenTab, Spool, RavelSettings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";

export const EventsRepo = {
  add: (e: ActivityEvent) => put(STORES.events, e),
  all: () => getAll<ActivityEvent>(STORES.events),
  byId: (id: string) => get<ActivityEvent>(STORES.events, id),
};

// NOTE: RAVEL intentionally does NOT persist TopicCluster/RabbitHole rows.
// The analysis pipeline (see analysis/index.ts) recomputes them on demand
// from the raw ActivityEvent log every time a snapshot is requested, which
// is cheap at the data volumes a single browser profile produces and
// avoids an entire class of cache-invalidation bugs.

// The live layer: what's open right now. tabId is the key, so a re-navigated
// or re-focused tab is always an upsert, never a duplicate.
export const OpenTabsRepo = {
  all: () => getAll<OpenTab>(STORES.openTabs),
  upsert: (t: OpenTab) => put(STORES.openTabs, t),
  remove: (tabId: number) => del(STORES.openTabs, tabId),
};

// Archived, closed threads - the whole point of ravelling one: the tabs are
// gone, this is what was kept. Newest first is the only order anyone wants.
export const SpoolsRepo = {
  async all(): Promise<Spool[]> {
    const rows = await getAll<Spool>(STORES.spools);
    return rows.sort((a, b) => b.closedAt - a.closedAt);
  },
  add: (t: Spool) => put(STORES.spools, t),
  remove: (id: string) => del(STORES.spools, id),
};

export const SettingsRepo = {
  async get(): Promise<RavelSettings> {
    const row = await get<{ key: string; value: RavelSettings }>(STORES.settings, "settings");
    // Merge over defaults rather than returning the stored row verbatim -
    // otherwise a settings row saved before a new field existed comes back
    // with that field silently undefined instead of its default.
    return row?.value ? { ...DEFAULT_SETTINGS, ...row.value } : DEFAULT_SETTINGS;
  },
  async set(partial: Partial<RavelSettings>): Promise<RavelSettings> {
    const current = await SettingsRepo.get();
    const next = { ...current, ...partial };
    await put(STORES.settings, { key: "settings", value: next });
    return next;
  },
};
