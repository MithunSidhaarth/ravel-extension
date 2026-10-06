// Hand-written declarations for the vendored anime.js v4 ESM bundle.
// RAVEL only uses a small slice of the library's surface - this is not a
// full port of animejs's own types, just enough for popup.ts/dashboard.ts
// to call these functions without `any` leaking through noImplicitAny.

export type AnimeTarget =
  | string
  | Element
  | Element[]
  | NodeListOf<Element>
  | Record<string, unknown>
  | null;

export interface AnimeParams {
  [prop: string]: unknown;
}

export interface AnimeInstance {
  play(): AnimeInstance;
  pause(): AnimeInstance;
  restart(): AnimeInstance;
  then<T>(onResolve?: (value: unknown) => T): Promise<T>;
}

export interface TimelineInstance extends AnimeInstance {
  add(targets: AnimeTarget, params?: AnimeParams, position?: string | number): TimelineInstance;
}

export function animate(targets: AnimeTarget, params: AnimeParams): AnimeInstance;
export function createTimeline(params?: AnimeParams): TimelineInstance;
export function stagger(
  value: number | string,
  options?: { start?: number; from?: number | string; ease?: string }
): (el: Element, i: number, total: number) => number;
export const eases: Record<string, (...args: number[]) => (t: number) => number>;
