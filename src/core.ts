export const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid)$/i;

export interface TabRecord { recordId: string; firstSeen: number; url: string; title: string; windowId: number; index: number; pinned: boolean; cookieStoreId?: string; closedAt?: number; closedAtActiveMs?: number; sessionId?: string }
export interface UrlUsage { lastAccess?: number; activations: number; closedAt?: number; closedAtActiveMs?: number }
export interface Collection { id: string; name: string; createdAt: number; pinned?: boolean; tabs: { url: string; title: string }[] }
export interface UndoEntry { id: string; kind: 'close' | 'move'; at: number; atActiveMs?: number; tabs: TabRecord[]; destinationWindowId?: number }
export interface Preferences { hiddenTopSites: string[]; pinnedTopSites: string[]; actionUsage: Record<string, number>; fontSize: number }
export interface Store { closed: Record<string, TabRecord>; usage: Record<string, UrlUsage>; collections: Collection[]; undo: UndoEntry[]; retention: { elapsedMs: number; activeSince?: number }; weather?: { enabled: boolean; location?: { name: string; latitude: number; longitude: number } }; preferences: Preferences }
export const EMPTY_STORE: Store = { closed: {}, usage: {}, collections: [], undo: [], retention: { elapsedMs: 0 }, preferences: { hiddenTopSites: [], pinnedTopSites: [], actionUsage: {}, fontSize: 14 } };

export function retentionElapsed(retention: Store['retention'], currentTime: number): number {
  return retention.elapsedMs + (retention.activeSince === undefined ? 0 : Math.max(0, currentTime - retention.activeSince));
}
export function checkpointRetention(retention: Store['retention'], currentTime: number): Store['retention'] {
  return retention.activeSince === undefined ? retention : { elapsedMs: retentionElapsed(retention, currentTime), activeSince: currentTime };
}

export function selectorBounds(window: { left: number; top: number; width: number; height: number }) {
  return {
    left: Math.round(window.left + window.width * 0.15),
    top: Math.round(window.top + window.height * 0.1),
    width: Math.round(window.width * 0.7),
    height: Math.round(window.height * 0.8)
  };
}

export function urlKey(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw;
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch { return raw; }
}

export function parseUrlFile(text: string): { urls: string[]; invalid: { line: number; value: string }[] } {
  const urls: string[] = [], invalid: { line: number; value: string }[] = [];
  text.split(/\r?\n/).forEach((value, index) => {
    const input = value.trim();
    if (!input || input.startsWith('#')) return;
    try { const url = new URL(input); if (url.protocol === 'http:' || url.protocol === 'https:') urls.push(url.href); else invalid.push({ line: index + 1, value: input }); }
    catch { invalid.push({ line: index + 1, value: input }); }
  });
  return { urls, invalid };
}

export function prune(store: Store, activeNow: number): Store {
  const closed = Object.fromEntries(Object.entries(store.closed).filter(([, r]) => r.closedAtActiveMs === undefined || activeNow - r.closedAtActiveMs < RETENTION_MS));
  const usage = Object.fromEntries(Object.entries(store.usage).filter(([, u]) => u.closedAtActiveMs === undefined || activeNow - u.closedAtActiveMs < RETENTION_MS));
  return { ...store, closed, usage, undo: store.undo.filter(u => u.atActiveMs === undefined || activeNow - u.atActiveMs < RETENTION_MS) };
}

export function chooseDuplicateSurvivors<T extends { id: number; url?: string; active?: boolean; windowId: number; lastAccess?: number; firstSeen?: number }>(tabs: T[], focusedWindowId: number): number[] {
  const groups = new Map<string, T[]>();
  for (const tab of tabs) if (tab.url) groups.set(tab.url, [...(groups.get(tab.url) || []), tab]);
  return [...groups.values()].flatMap(group => {
    if (group.length < 2) return [];
    group.sort((a, b) => Number(b.active && b.windowId === focusedWindowId) - Number(a.active && a.windowId === focusedWindowId) || (b.lastAccess || 0) - (a.lastAccess || 0) || (a.firstSeen || 0) - (b.firstSeen || 0));
    return group.slice(1).map(t => t.id);
  });
}

export type SortDirection = 'asc' | 'desc';
export const defaultSortDirection = (field: string): SortDirection => ['lastAccess', 'firstSeen', 'isLoaded', 'active', 'highlighted', 'pinned', 'audible', 'muted', 'discarded', 'autoDiscardable', 'hidden', 'attention', 'isArticle', 'isInReaderMode'].includes(field) ? 'desc' : 'asc';
export function displayUrl(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/^https:\/\//i, '').replace(/^www\./i, '');
}
export function rootDomainUrl(raw: string): string | null {
  try { const url = new URL(raw); return /^https?:$/.test(url.protocol) ? `${url.protocol}//${url.hostname.replace(/^www\./i, '')}/` : null; } catch { return null; }
}
export function frequentSiteDisplayName(raw: string): string {
  try {
    const hostname = new URL(raw).hostname;
    if (!/^www\./i.test(hostname)) return hostname;
    const withoutWww = hostname.replace(/^www\./i, '');
    const withoutTld = withoutWww.replace(/\.[^.]+$/, '');
    return withoutTld ? withoutTld[0].toLocaleUpperCase() + withoutTld.slice(1) : withoutWww;
  } catch { return raw; }
}
export function firstSeenAgeLabel(firstSeen: number, currentTime = Date.now()): string | null {
  const elapsed = Math.max(0, currentTime - firstSeen);
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}h`;
  return `${Math.floor(elapsed / 86400000)}d`;
}
export function fitColumnWidths(widths: number[], minimums: number[], budget: number): number[] {
  const target = Math.max(0, budget);
  const result = [...widths];
  const total = result.reduce((sum, width) => sum + width, 0);
  if (total < target) {
    const extra = target - total;
    const titleIndex = result.length === 9 ? 2 : 1;
    const urlIndex = result.length === 9 ? 3 : 4;
    result[titleIndex] += extra / 2;
    result[urlIndex] += extra / 2;
  } else if (total > target) {
    const minimumTotal = minimums.reduce((sum, width) => sum + width, 0);
    if (target < minimumTotal) {
      const fixed = Math.min(minimums[0], target);
      const flexibleTotal = minimumTotal - minimums[0];
      return [fixed, ...minimums.slice(1).map(width => width * (target - fixed) / flexibleTotal)];
    }
    const capacity = result.map((width, i) => Math.max(0, width - minimums[i]));
    const totalCapacity = capacity.reduce((sum, width) => sum + width, 0);
    const excess = total - target;
    return result.map((width, i) => width - excess * capacity[i] / totalCapacity);
  }
  return result;
}
export function resizeColumns(widths: number[], minimums: number[], index: number, delta: number): number[] {
  if (index <= 0 || index >= widths.length - 1) return [...widths];
  const result = [...widths];
  const right = Array.from({ length: Math.max(0, widths.length - index - 2) }, (_, offset) => index + 1 + offset);
  const left = Array.from({ length: Math.max(0, index - 1) }, (_, offset) => index - 1 - offset);
  const flexible = [...right, ...left];
  const totalCapacity = flexible.reduce((sum, i) => sum + Math.max(0, result[i] - minimums[i]), 0);
  const change = Math.max(minimums[index] - result[index], Math.min(delta, totalCapacity));
  if (!change) return result;
  result[index] += change;
  if (change > 0) {
    let remaining = change;
    for (const group of [right, left]) {
      const capacities = group.map(i => Math.max(0, result[i] - minimums[i]));
      const capacity = capacities.reduce((sum, value) => sum + value, 0);
      const amount = Math.min(remaining, capacity);
      if (amount && capacity) group.forEach((i, position) => { result[i] -= amount * capacities[position] / capacity; });
      remaining -= amount;
    }
  } else {
    const receivers = right.length ? right : left;
    const weightTotal = receivers.reduce((sum, i) => sum + result[i], 0);
    if (weightTotal) receivers.forEach(i => { result[i] -= change * result[i] / weightTotal; });
  }
  return result;
}
export interface TabFilter { query: string; queryMode?: 'is' | 'not'; sort: string; sortDirection?: SortDirection; ageMode: 'any' | 'older' | 'newer'; ageDays: number; accessMode: 'any' | 'within' | 'before'; accessDays: number }
export function filterAndSortTabs<T extends { id: number; title?: string; url?: string; firstSeen: number; lastAccess?: number; [key: string]: any }>(tabs: T[], options: TabFilter, currentTime = Date.now()): T[] {
  let windowId: number | null = null;
  const query = options.query.replace(/(?:^|\s)window:(\d+)(?=\s|$)/gi, (_match, id) => {
    windowId = Number(id);
    return ' ';
  }).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const ageCutoff = options.ageMode === 'any' ? null : currentTime - options.ageDays * 86400000;
  const cutoff = options.accessMode === 'any' ? null : currentTime - options.accessDays * 86400000;
  const direction = options.sortDirection || defaultSortDirection(options.sort);
  return tabs.filter(tab => {
    const hasSearch = windowId !== null || query.length > 0;
    const windowMatches = windowId === null || tab.windowId === windowId;
    const textMatches = !query || (tab.title || '').toLocaleLowerCase().includes(query) || (tab.url || '').toLocaleLowerCase().includes(query);
    const searchMatches = windowMatches && textMatches;
    if (hasSearch && (options.queryMode === 'not' ? searchMatches : !searchMatches)) return false;
    if (options.ageMode === 'older' && tab.firstSeen >= ageCutoff!) return false;
    if (options.ageMode === 'newer' && tab.firstSeen < ageCutoff!) return false;
    if (options.accessMode === 'within' && (!tab.lastAccess || tab.lastAccess < cutoff!)) return false;
    if (options.accessMode === 'before' && (!tab.lastAccess || tab.lastAccess >= cutoff!)) return false;
    return true;
  }).sort((a, b) => {
    const av = a[options.sort], bv = b[options.sort];
    let primary = 0;
    if (av == null) primary = bv == null ? 0 : 1;
    else if (bv == null) primary = -1;
    else if (typeof av === 'number' && typeof bv === 'number') primary = direction === 'desc' ? bv - av : av - bv;
    else if (typeof av === 'boolean' && typeof bv === 'boolean') primary = direction === 'desc' ? Number(bv) - Number(av) : Number(av) - Number(bv);
    else primary = direction === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    if (primary) return primary;
    const lastActive = (b.lastAccess || 0) - (a.lastAccess || 0);
    if (options.sort !== 'lastAccess' && lastActive) return lastActive;
    const title = String(a.title || '').localeCompare(String(b.title || ''));
    return title || a.id - b.id;
  });
}
