import { EMPTY_STORE, prune, urlKey, chooseDuplicateSurvivors, retentionElapsed, checkpointRetention, selectorBounds, sanitizeTabTitle, sanitizeTabUrl, type Store, type TabRecord, type UndoEntry, type Collection } from './core';
declare const browser: any;

const live = new Map<number, TabRecord>();
const pendingAccess = new Set<number>();
const normalWindowIds = new Set<number>();
let store: Store = structuredClone(EMPTY_STORE);
let focusedWindowId = -1;
let activeSince: number | undefined;
let initializing = true;
let initialFocusSeen = false;
const initialActiveTabs = new Map<number, number>();
let selectorWindowId: number | undefined;
let selectorSourceWindowId: number | undefined;
let selectorArmed = false;
let writes = Promise.resolve();
const now = () => Date.now();
const id = () => crypto.randomUUID();
const eligible = (tab: any) => tab && !tab.incognito && tab.id >= 0 && !!tab.windowId;
const sanitizeBrowserTab = (tab: any) => ({ ...tab, title: sanitizeTabTitle(tab?.title), url: sanitizeTabUrl(tab?.url) });
const activeNow = () => retentionElapsed({ elapsedMs: store.retention.elapsedMs, activeSince }, now());
function checkpointClock() {
  store.retention = checkpointRetention({ elapsedMs: store.retention.elapsedMs, activeSince }, now());
  activeSince = store.retention.activeSince;
}
const save = () => { checkpointClock(); writes = writes.then(() => browser.storage.local.set({ state: store })); return writes; };
function migrateRetention(saved: any) {
  if (saved?.retention) return;
  store.retention = { elapsedMs: 0 };
  for (const record of Object.values(store.closed)) if (record.closedAt !== undefined) record.closedAtActiveMs = 0;
  for (const usage of Object.values(store.usage)) if (usage.closedAt !== undefined) usage.closedAtActiveMs = 0;
  for (const entry of store.undo) entry.atActiveMs = 0;
}

async function normalTabs(): Promise<any[]> {
  const windows = await browser.windows.getAll({ populate: true, windowTypes: ['normal'] });
  return windows.filter((w: any) => !w.incognito).flatMap((w: any) => w.tabs || []).filter(eligible).map(sanitizeBrowserTab);
}
async function makeRecord(tab: any, startup = false): Promise<TabRecord> {
  tab = sanitizeBrowserTab(tab);
  if (live.has(tab.id)) return live.get(tab.id)!;
  let session: any;
  try { session = await browser.sessions.getTabValue(tab.id, 'ftmRecord'); } catch { /* fresh tab */ }
  if (live.has(tab.id)) return live.get(tab.id)!;
  const restored = session?.recordId && store.closed[session.recordId];
  const record: TabRecord = restored ? { ...restored } : {
    recordId: startup && session?.recordId ? session.recordId : id(),
    firstSeen: startup && session?.firstSeen ? session.firstSeen : now(),
    url: '', title: '', windowId: tab.windowId, index: tab.index, pinned: !!tab.pinned
  };
  Object.assign(record, { url: tab.url === 'about:blank' && restored ? record.url : tab.url || record.url, title: tab.title || record.title, windowId: tab.windowId, index: tab.index, pinned: !!tab.pinned, cookieStoreId: tab.cookieStoreId, closedAt: undefined, closedAtActiveMs: undefined, sessionId: undefined });
  live.set(tab.id, record);
  if (restored) delete store.closed[record.recordId];
  const usage = store.usage[urlKey(record.url)];
  if (usage) { delete usage.closedAt; delete usage.closedAtActiveMs; }
  await browser.sessions.setTabValue(tab.id, 'ftmRecord', { recordId: record.recordId, firstSeen: record.firstSeen });
  if (restored) await save();
  return record;
}
async function refreshTab(tabId: number) {
  let tab: any;
  try { tab = sanitizeBrowserTab(await browser.tabs.get(tabId)); } catch { return; }
  if (!eligible(tab)) return;
  const record = await makeRecord(tab);
  const oldKey = urlKey(record.url);
  const nextUrl = tab.url === 'about:blank' && record.url && record.url !== 'about:blank' ? record.url : tab.url || record.url;
  Object.assign(record, { url: nextUrl, title: tab.title || record.title, windowId: tab.windowId, index: tab.index, pinned: !!tab.pinned, cookieStoreId: tab.cookieStoreId });
  const nextKey = urlKey(record.url);
  if (store.usage[nextKey]) { delete store.usage[nextKey].closedAt; delete store.usage[nextKey].closedAtActiveMs; }
  if (oldKey !== nextKey && store.usage[oldKey] && ![...live.values()].some(r => urlKey(r.url) === oldKey)) { store.usage[oldKey].closedAt = now(); store.usage[oldKey].closedAtActiveMs = activeNow(); await save(); }
}
async function markAccess(tabId: number) {
  let tab: any;
  try { tab = sanitizeBrowserTab(await browser.tabs.get(tabId)); } catch { return; }
  if (!eligible(tab) || !tab.active || tab.status !== 'complete' || tab.windowId !== focusedWindowId || !/^https?:/.test(tab.url || '')) return;
  const record = await makeRecord(tab);
  const key = urlKey(tab.url);
  const usage = store.usage[key] || { activations: 0 };
  usage.lastAccess = now(); usage.activations++; delete usage.closedAt; delete usage.closedAtActiveMs;
  store.usage[key] = usage;
  record.url = tab.url;
  await save();
}
async function closeRecord(tabId: number) {
  const record = live.get(tabId);
  pendingAccess.delete(tabId); live.delete(tabId);
  if (!record) return;
  record.closedAt = now();
  record.closedAtActiveMs = activeNow();
  store.closed[record.recordId] = record;
  const key = urlKey(record.url);
  if (![...live.values()].some(r => urlKey(r.url) === key) && store.usage[key]) { store.usage[key].closedAt = record.closedAt; store.usage[key].closedAtActiveMs = record.closedAtActiveMs; }
  store = prune(store, activeNow());
  await save();
}
const ready = (async () => {
  const saved = (await browser.storage.local.get('state')).state;
  store = { ...structuredClone(EMPTY_STORE), ...saved };
  store.preferences = { ...EMPTY_STORE.preferences, ...saved?.preferences };
  migrateRetention(saved);
  const sessionState = await browser.storage.session.get(['ftmClockSession', 'ftmSelector']);
  const sameSession = sessionState.ftmClockSession === true;
  if (sessionState.ftmSelector) {
    const selector = await browser.windows.get(sessionState.ftmSelector.windowId).catch(() => null);
    if (selector?.type === 'popup') { selectorWindowId = selector.id; selectorSourceWindowId = sessionState.ftmSelector.sourceWindowId; selectorArmed = true; }
  }
  activeSince = sameSession ? store.retention.activeSince : undefined;
  const windows = await browser.windows.getAll({ populate: true, windowTypes: ['normal'] });
  for (const win of windows) if (!win.incognito) normalWindowIds.add(win.id);
  if (!normalWindowIds.size && activeSince !== undefined) { checkpointClock(); activeSince = undefined; }
  else if (activeSince === undefined) activeSince = now();
  await browser.storage.session.set({ ftmClockSession: true });
  try { focusedWindowId = (await browser.windows.getLastFocused()).id; } catch { /* no window */ }
  for (const win of windows) if (!win.incognito) {
    for (const tab of win.tabs || []) if (eligible(tab)) {
      if (tab.active) initialActiveTabs.set(win.id, tab.id);
      await makeRecord(tab, true);
    }
  }
  store = prune(store, activeNow());
  await save();
  initializing = false;
})();

browser.tabs.onCreated.addListener((tab: any) => { if (initializing) return; void ready.then(() => eligible(tab) && makeRecord(tab)); });
browser.tabs.onRemoved.addListener((tabId: number) => { if (initializing) return; void ready.then(() => closeRecord(tabId)); });
browser.tabs.onUpdated.addListener((tabId: number, change: any) => { void ready.then(async () => {
  await refreshTab(tabId);
  if (change.status === 'complete' && pendingAccess.delete(tabId)) await markAccess(tabId);
}); });
browser.tabs.onAttached.addListener((tabId: number) => { void ready.then(() => refreshTab(tabId)); });
browser.tabs.onMoved.addListener((tabId: number) => { void ready.then(() => refreshTab(tabId)); });
browser.tabs.onActivated.addListener((info: any) => { if (initializing) return; void ready.then(async () => {
  if (initialActiveTabs.get(info.windowId) === info.tabId) { initialActiveTabs.delete(info.windowId); return; }
  initialActiveTabs.delete(info.windowId);
  const rawTab = await browser.tabs.get(info.tabId).catch(() => null);
  const tab = rawTab ? sanitizeBrowserTab(rawTab) : null;
  if (!eligible(tab) || info.windowId !== focusedWindowId) return;
  if (tab.status === 'complete') await markAccess(tab.id); else pendingAccess.add(tab.id);
}); });
browser.windows.onFocusChanged.addListener((windowId: number) => { if (initializing) return; void ready.then(async () => {
  if (selectorWindowId === windowId) selectorArmed = true;
  else if (selectorWindowId !== undefined && selectorArmed) {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      const pendingSelectorId = selectorWindowId;
      setTimeout(() => { void (async () => {
        if (selectorWindowId !== pendingSelectorId || !selectorArmed) return;
        const selector = await browser.windows.get(pendingSelectorId).catch(() => null);
        if (!selector?.focused) await dismissSelector();
      })(); }, 100);
    } else await dismissSelector();
  }
  if (!initialFocusSeen) { focusedWindowId = windowId; if (windowId !== browser.windows.WINDOW_ID_NONE) initialFocusSeen = true; return; }
  focusedWindowId = windowId;
  if (selectorWindowId === windowId) return;
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  const win = await browser.windows.get(windowId).catch(() => null);
  if (!win || win.type !== 'normal' || win.incognito) return;
  const [tab] = await browser.tabs.query({ windowId, active: true });
  if (eligible(tab)) { if (tab.status === 'complete') await markAccess(tab.id); else pendingAccess.add(tab.id); }
}); });
browser.windows.onCreated.addListener((win: any) => { if (initializing) return; void ready.then(async () => {
  if ((win.type && win.type !== 'normal') || win.incognito) return;
  const wasInactive = normalWindowIds.size === 0;
  normalWindowIds.add(win.id);
  if (wasInactive) activeSince = now();
  await save();
}); });
browser.windows.onRemoved.addListener((windowId: number) => { if (initializing) return; void ready.then(async () => {
  if (windowId === selectorWindowId) {
    selectorWindowId = undefined; selectorSourceWindowId = undefined; selectorArmed = false;
    await browser.storage.session.remove('ftmSelector');
    return;
  }
  if (windowId === selectorSourceWindowId) await dismissSelector();
  normalWindowIds.delete(windowId);
  if (!normalWindowIds.size && activeSince !== undefined) { checkpointClock(); activeSince = undefined; }
  await save();
}); });

async function dismissSelector() {
  const windowId = selectorWindowId;
  selectorWindowId = undefined; selectorSourceWindowId = undefined; selectorArmed = false;
  await browser.storage.session.remove('ftmSelector');
  if (windowId !== undefined) await browser.windows.remove(windowId).catch(() => {});
}
async function openSelector(tab: any) {
  if (selectorWindowId !== undefined) {
    const existing = await browser.windows.get(selectorWindowId).catch(() => null);
    if (existing) { await browser.windows.update(existing.id, { focused: true }); return; }
    await dismissSelector();
  }
  const source = tab?.windowId ? await browser.windows.get(tab.windowId) : await browser.windows.getLastFocused();
  const incognito = await browser.extension.isAllowedIncognitoAccess().catch(() => false);
  if ((source.type && source.type !== 'normal') || (source.incognito && !incognito) || ![source.left, source.top, source.width, source.height].every(Number.isFinite)) return;
  const created = await browser.windows.create({
    url: browser.runtime.getURL('popup.html'), type: 'popup', focused: true, incognito,
    ...selectorBounds(source)
  });
  selectorWindowId = created.id; selectorSourceWindowId = source.id;
  await browser.storage.session.set({ ftmSelector: { windowId: created.id, sourceWindowId: source.id } });
  setTimeout(() => { void (async () => {
    if (selectorWindowId !== created.id) return;
    selectorArmed = true;
    const win = await browser.windows.get(created.id).catch(() => null);
    if (!win?.focused) await dismissSelector();
  })(); }, 150);
}
browser.action.onClicked.addListener((tab: any) => { void ready.then(() => openSelector(tab)); });

async function snapshot() {
  const tabs = await normalTabs();
  await Promise.all(tabs.map((tab: any) => refreshTab(tab.id)));
  return { tabs: tabs.map((tab: any) => ({ ...tab, muted: !!tab.mutedInfo?.muted, isLoaded: !tab.discarded, firstSeen: live.get(tab.id)?.firstSeen || now(), recordId: live.get(tab.id)?.recordId, lastAccess: store.usage[urlKey(tab.url || '')]?.lastAccess })), collections: store.collections, undo: store.undo, weather: store.weather || { enabled: false }, preferences: store.preferences, focusedWindowId: selectorSourceWindowId ?? focusedWindowId };
}
async function validateTabs(tabIds: number[]) {
  const results = await Promise.all([...new Set(tabIds)].map((tabId) => browser.tabs.get(tabId).catch(() => null)));
  const tabs = results.filter(eligible).map(sanitizeBrowserTab);
  await Promise.all(tabs.map((tab: any) => refreshTab(tab.id)));
  return tabs;
}
async function doClose(tabs: any[]) {
  const entry: UndoEntry = { id: id(), kind: 'close', at: now(), atActiveMs: activeNow(), tabs: tabs.map(t => ({ ...live.get(t.id)! })) };
  store.undo.unshift(entry); store.undo = store.undo.slice(0, 30); await save();
  const errors: string[] = [];
  for (const [index, tab] of tabs.entries()) {
    const recordId = entry.tabs[index]?.recordId;
    try {
      await browser.tabs.remove(tab.id);
      const recently = await browser.sessions.getRecentlyClosed({ maxResults: 5 });
      const match = recently.find((s: any) => !s.tab?.incognito && s.tab?.url === tab.url && s.tab?.sessionId);
      if (match) { const record = entry.tabs.find(r => r.recordId === recordId); if (record) record.sessionId = match.tab.sessionId; }
    } catch (e) { errors.push(`${tab.title || tab.url}: ${String(e)}`); entry.tabs = entry.tabs.filter(r => r.recordId !== recordId); }
  }
  if (!entry.tabs.length) store.undo = store.undo.filter(u => u.id !== entry.id);
  await save();
  return { count: tabs.length - errors.length, errors };
}
async function undo(entryId?: string) {
  store = prune(store, activeNow());
  const entry = entryId ? store.undo.find(u => u.id === entryId) : store.undo[0];
  if (!entry) throw Error('No recent action to undo.');
  const errors: string[] = [];
  if (entry.kind === 'move') {
    const replacementWindows = new Map<number, number>();
    for (const record of entry.tabs) {
      const current = [...live.entries()].find(([, r]) => r.recordId === record.recordId);
      if (!current) { errors.push(`Missing tab: ${record.title}`); continue; }
      try {
        let target = record.windowId;
        try { await browser.windows.get(target); } catch {
          if (!replacementWindows.has(target)) replacementWindows.set(target, (await browser.windows.create({ tabId: current[0] })).id);
          target = replacementWindows.get(target)!;
        }
        await browser.tabs.move(current[0], { windowId: target, index: record.index });
      } catch { errors.push(`Could not restore placement: ${record.title}`); }
    }
  } else {
    const replacementWindows = new Map<number, number>();
    for (const record of entry.tabs) {
      try {
        if ([...live.values()].some(r => r.recordId === record.recordId)) continue;
        let restored: any;
        if (record.sessionId) restored = (await browser.sessions.restore(record.sessionId).catch(() => null))?.tab;
        if (!restored) {
          const opts: any = { url: record.url, active: false, pinned: record.pinned };
          try { const win = await browser.windows.get(record.windowId); if (!win.incognito && win.type === 'normal') opts.windowId = win.id; } catch { /* recreate original grouping */ }
          if (!opts.windowId && replacementWindows.has(record.windowId)) opts.windowId = replacementWindows.get(record.windowId);
          if (!opts.windowId) {
            restored = (await browser.windows.create({ url: record.url })).tabs[0];
            replacementWindows.set(record.windowId, restored.windowId);
          } else restored = await browser.tabs.create(opts);
          live.set(restored.id, { ...record, windowId: restored.windowId, index: restored.index, closedAt: undefined, closedAtActiveMs: undefined });
          await browser.sessions.setTabValue(restored.id, 'ftmRecord', { recordId: record.recordId, firstSeen: record.firstSeen });
          delete store.closed[record.recordId];
        }
      } catch (e) { errors.push(`${record.title || record.url}: ${String(e)}`); }
    }
  }
  store.undo = store.undo.filter(u => u.id !== entry.id); await save();
  return { count: entry.tabs.length - errors.length, errors };
}
async function action(message: any): Promise<any> {
  await ready;
  store = prune(store, activeNow());
  if (message.type === 'snapshot') return snapshot();
  if (message.type === 'openDashboard') {
    const windowId = selectorSourceWindowId ?? focusedWindowId;
    const tab = await browser.tabs.create({ windowId, url: browser.runtime.getURL('dashboard.html') });
    await browser.windows.update(windowId, { focused: true });
    return tab;
  }
  if (message.type === 'focus') { const tab = await browser.tabs.get(message.tabId); if (!eligible(tab)) throw Error('Tab unavailable'); await browser.windows.update(tab.windowId, { focused: true }); return browser.tabs.update(tab.id, { active: true }); }
  if (message.type === 'undo') return undo(message.entryId);
  if (message.type === 'saveCollection') {
    const tabs = await validateTabs(message.tabIds);
    const collection: Collection = { id: id(), name: message.name || `Collection ${new Date().toLocaleString()}`, createdAt: now(), tabs: tabs.filter((t: any) => /^https?:/.test(t.url || '')).map((t: any) => ({ url: t.url, title: t.title || t.url })) };
    if (!collection.tabs.length) throw Error('No HTTP(S) tabs to save.');
    store.collections.unshift(collection); await save();
    if (message.close) return { collection, ...await doClose(tabs.filter((t: any) => /^https?:/.test(t.url || ''))) };
    return { collection };
  }
  if (message.type === 'importCollection') {
    const collection: Collection = { id: id(), name: message.name, createdAt: now(), tabs: message.urls.map((url: string) => ({ url, title: url })) };
    store.collections.unshift(collection); await save(); return collection;
  }
  if (message.type === 'deleteCollection') { store.collections = store.collections.filter(c => c.id !== message.collectionId); await save(); return true; }
  if (message.type === 'pinCollection') { const collection = store.collections.find(c => c.id === message.collectionId); if (!collection) throw Error('Collection not found'); collection.pinned = !collection.pinned; await save(); return collection; }
  if (message.type === 'topSitePreference') {
    const list = message.preference === 'hidden' ? store.preferences.hiddenTopSites : store.preferences.pinnedTopSites;
    const other = message.preference === 'hidden' ? store.preferences.pinnedTopSites : store.preferences.hiddenTopSites;
    store.preferences[message.preference === 'hidden' ? 'hiddenTopSites' : 'pinnedTopSites'] = message.enabled ? [...new Set([...list, message.url])] : list.filter(url => url !== message.url);
    if (message.enabled) store.preferences[message.preference === 'hidden' ? 'pinnedTopSites' : 'hiddenTopSites'] = other.filter(url => url !== message.url);
    await save(); return store.preferences;
  }
  if (message.type === 'recordActionUsage') {
    const allowed = new Set(['close', 'discard', 'saveCollection', 'saveClose', 'export', 'move', 'duplicates']);
    if (!allowed.has(message.action)) throw Error('Unknown action usage key');
    store.preferences.actionUsage[message.action] = (store.preferences.actionUsage[message.action] || 0) + 1;
    await save(); return store.preferences.actionUsage;
  }
  if (message.type === 'setFontSize') {
    if (![12, 14, 16, 18].includes(message.fontSize)) throw Error('Unsupported font size');
    store.preferences.fontSize = message.fontSize;
    await save(); return store.preferences.fontSize;
  }
  if (message.type === 'openCollection') {
    const collection = store.collections.find(c => c.id === message.collectionId); if (!collection) throw Error('Collection not found');
    const items = message.url ? collection.tabs.filter(t => t.url === message.url).slice(0, 1) : collection.tabs;
    if (!items.length) return { count: 0 };
    const currentWindowId = selectorSourceWindowId ?? focusedWindowId;
    let created = !!message.newWindow || currentWindowId < 0;
    let winId = created ? (await browser.windows.create({ url: items[0].url })).id : currentWindowId;
    for (const item of items.slice(created ? 1 : 0)) await browser.tabs.create({ windowId: winId, url: item.url, active: false });
    return { count: items.length };
  }
  let tabs = await validateTabs(message.tabIds || []);
  if (message.type === 'duplicates') {
    const all = (await snapshot()).tabs;
    const duplicates = chooseDuplicateSurvivors(all, selectorSourceWindowId ?? focusedWindowId);
    tabs = await validateTabs(duplicates);
    return doClose(tabs);
  }
  if (message.type === 'close') return doClose(tabs);
  if (message.type === 'export') {
    const urls = tabs.map(t => t.url).filter((url: string) => /^https?:/.test(url || ''));
    if (!urls.length) throw Error('No HTTP(S) URLs to export.');
    const objectUrl = URL.createObjectURL(new Blob([urls.join('\n') + '\n'], { type: 'text/plain' }));
    try {
      const downloadId = await browser.downloads.download({ url: objectUrl, filename: `firefox-tabs-${new Date().toISOString().slice(0, 10)}.txt`, saveAs: true, conflictAction: 'uniquify' });
      await new Promise<void>((resolve, reject) => {
        const listener = (change: any) => {
          if (change.id !== downloadId || !change.state) return;
          browser.downloads.onChanged.removeListener(listener);
          if (change.state.current === 'complete') resolve(); else reject(Error('Export did not complete; tabs were kept open.'));
        };
        browser.downloads.onChanged.addListener(listener);
      });
      return { count: urls.length, errors: [] };
    } finally { URL.revokeObjectURL(objectUrl); }
  }
  if (message.type === 'discard') {
    const errors: string[] = []; let count = 0;
    for (const tab of tabs) try {
      await browser.tabs.discard(tab.id);
      const discarded = await browser.tabs.get(tab.id);
      if (!discarded.discarded) throw Error('Firefox did not mark the tab as unloaded.');
      count++;
    } catch (e) { errors.push(`${tab.title || tab.url}: ${String(e)}`); }
    return { count, errors };
  }
  if (message.type === 'move') {
    const entry: UndoEntry = { id: id(), kind: 'move', at: now(), atActiveMs: activeNow(), tabs: [] };
    const originals = new Map(tabs.map(t => [t.id, { ...live.get(t.id)! }]));
    const target = message.newWindow ? (await browser.windows.create({ tabId: tabs[0].id })).id : message.windowId;
    const errors: string[] = []; let count = 0;
    for (const [index, tab] of tabs.entries()) {
      if (message.newWindow && index === 0) { entry.tabs.push(originals.get(tab.id)!); count++; continue; }
      try { await browser.tabs.move(tab.id, { windowId: target, index: message.newWindow ? 0 : -1 }); entry.tabs.push(originals.get(tab.id)!); count++; }
      catch (e) { errors.push(`${tab.title || tab.url}: ${String(e)}`); }
    }
    if (count) { store.undo.unshift(entry); store.undo = store.undo.slice(0, 30); await save(); }
    return { count, errors };
  }
  if (message.type === 'weatherSettings') { store.weather = message.weather; await save(); return true; }
  throw Error('Unknown action');
}
browser.runtime.onMessage.addListener((message: any) => action(message));
