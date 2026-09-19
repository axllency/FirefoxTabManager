import { parseUrlFile, filterAndSortTabs, defaultSortDirection, firstSeenAgeLabel, fitColumnWidths, resizeColumns, displayUrl, rootDomainUrl, frequentSiteDisplayName, type SortDirection } from './core';
declare const browser: any;
const $ = (selector: string) => document.querySelector(selector) as HTMLElement;
const page = document.body.dataset.page;
const state: any = { tabs: [], collections: [], undo: [], focusedWindowId: -1, weather: { enabled: false }, preferences: { hiddenTopSites: [], pinnedTopSites: [], actionUsage: {}, fontSize: 14 } };
const bulkActions = [
  ['close', 'Close'], ['discard', 'Unload'], ['saveCollection', 'Save collection'], ['saveClose', 'Save and close'],
  ['export', 'Export URLs'], ['move', 'Combine tabs'], ['duplicates', 'Close duplicates']
] as const;
let topSites: any[] = [];
let selected = new Set<number>();
let filtered: any[] = [];
let sortDirection: SortDirection = 'desc';
let currentSort = 'lastAccess';
const widthKey = 'advanced-tab-manager-column-widths-v10';
const minColumnWidths = [22, 28, 100, 100, 40, 76, 48, 28];
let columnWidths: number[] | undefined;
try {
  const saved = JSON.parse(localStorage.getItem(widthKey) || 'null');
  if (Array.isArray(saved) && saved.length === 8 && saved.every((width, i) => Number.isFinite(width) && width >= minColumnWidths[i] && width <= 2000)) columnWidths = saved;
} catch { /* Ignore invalid saved layout. */ }
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, options: { className?: string; text?: string; attrs?: Record<string, string>; data?: Record<string, string> } = {}) => {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs || {})) element.setAttribute(name, value);
  for (const [name, value] of Object.entries(options.data || {})) element.dataset[name] = value;
  return element;
};
const send = (type: string, data: any = {}) => browser.runtime.sendMessage({ type, ...data });
const when = (time?: number) => time ? new Date(time).toLocaleString() : 'Never recorded';
const shortDate = (time?: number) => time ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: '2-digit' }).format(time) : '—';
const firstSeenDisplay = (time?: number) => time ? firstSeenAgeLabel(time) ?? shortDate(time) : '—';
const lastActive = (time?: number) => {
  if (!time) return 'NaN';
  const elapsed = Math.max(0, Date.now() - time);
  const days = Math.floor(elapsed / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} ago`;
  const hours = Math.floor(elapsed / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const minutes = Math.floor(elapsed / 60000);
  return minutes >= 1 ? `${minutes} min ago` : 'Just now';
};
const favicon = (url?: string) => {
  if (!url) return '';
  if (/^data:image\/(?:png|gif|jpeg|webp|svg\+xml);/i.test(url)) return url;
  try { return ['http:', 'https:', 'moz-extension:'].includes(new URL(url).protocol) ? url : ''; } catch { return ''; }
};
const tabIcon = (url?: string) => {
  const src = favicon(url);
  const wrapper = node('span', { className: 'site-icon', attrs: { 'aria-hidden': 'true' } });
  wrapper.append(node('span', { className: 'site-icon-fallback', text: '◉' }));
  if (src) {
    const image = node('img', { className: 'tab-favicon', attrs: { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } });
    image.src = src;
    wrapper.append(image);
  }
  return wrapper;
};
const heading = (label: string, field: string | undefined, index: number) => {
  const cell = node('span', { className: 'column-heading', attrs: { role: 'columnheader' } });
  if (field) {
    cell.setAttribute('aria-sort', currentSort === field ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none');
    const button = node('button', { className: 'sort-header', text: label, attrs: { title: `Sort by ${label}` }, data: { sort: field } });
    button.append(node('span', { className: 'sort-arrow', text: currentSort === field ? sortDirection === 'asc' ? '▲' : '▼' : '', attrs: { 'aria-hidden': 'true' } }));
    cell.append(button);
  } else cell.textContent = label;
  if (index > 0 && index < minColumnWidths.length - 1) cell.append(node('span', { className: 'resize-handle', attrs: { role: 'separator', 'aria-label': `Resize ${label} column`, title: 'Drag to resize column' }, data: { column: String(index) } }));
  return cell;
};
function applyColumnWidths() {
  const list = $('#tabs');
  if (!columnWidths) return;
  const header = list.querySelector<HTMLElement>('.tab-heading');
  if (!header) return;
  const style = getComputedStyle(header);
  const available = list.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 8 * parseFloat(style.columnGap);
  columnWidths = fitColumnWidths(columnWidths, minColumnWidths, available);
  list.style.setProperty('--tab-columns', columnWidths.map(width => `${width.toFixed(2)}px`).join(' '));
}
function layout() {
  $('#pageSubtitle').textContent = page === 'popup' ? 'Find tabs across windows' : 'Your tab workspace';
  if (page !== 'popup') $('#dashboard').remove();
  $('#query').addEventListener('input', () => { selected.clear(); renderTabs(); });
  $('#query').addEventListener('keydown', e => {
    const event = e as KeyboardEvent;
    if (event.key === 'Tab' && !event.shiftKey) {
      const firstTitle = $('#tabs').querySelector<HTMLElement>('.cell-title');
      if (firstTitle) { event.preventDefault(); firstTitle.focus(); }
      return;
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const first = filtered[0];
    if (!first) return notice('No matching tabs.');
    void activateTab(first.id);
  });
  $('#queryMode').addEventListener('input', () => { selected.clear(); renderTabs(); });
  $('#loadFilter').addEventListener('input', () => { selected.clear(); renderTabs(); });
  for (const selector of ['#ageMode','#agePeriod','#accessMode','#accessPeriod']) $(selector).addEventListener('input', renderTabs);
  const clearActionNotice = () => { const status = $('#notice'); if (status.dataset.source === 'action') notice(''); };
  $('#bulk').addEventListener('pointerdown', clearActionNotice);
  $('#bulk').addEventListener('keydown', clearActionNotice);
  $('#bulk').addEventListener('change', clearActionNotice);
  $('#bulkGo').addEventListener('click', async () => { const value = ($('#bulk') as HTMLSelectElement).value; if (value) await bulk(value); else notice('Choose an action first.', 'action'); });
  $('#selectAll').addEventListener('click', () => { if (selected.size) selected.clear(); else filtered.forEach(t => selected.add(t.id)); renderTabs(); });
  $('#undo').addEventListener('click', () => run(async () => { const r = await send('undo'); notice(`Restored ${r.count} tab(s). ${r.errors.join(' ')}`); await refresh(); }));
  if (page === 'popup') $('#dashboard').addEventListener('click', () => send('openDashboard'));
  if (page === 'popup') $('#titleDashboard').addEventListener('click', () => send('openDashboard'));
  $('#tabs').addEventListener('click', async e => {
    const target = e.target as HTMLElement;
    const sortButton = target.closest<HTMLButtonElement>('[data-sort]');
    if (sortButton) {
      sortDirection = currentSort === sortButton.dataset.sort ? sortDirection === 'asc' ? 'desc' : 'asc' : defaultSortDirection(sortButton.dataset.sort!);
      currentSort = sortButton.dataset.sort!;
      renderTabs();
      return;
    }
    const row = target.closest<HTMLElement>('[data-tab-id]'); if (!row) return;
    const tabId = Number(row.dataset.tabId);
    if (target.matches('input[type=checkbox]')) { if ((target as HTMLInputElement).checked) selected.add(tabId); else selected.delete(tabId); renderTabs(); return; }
    if (target === row || target.closest('.cell-check')) return;
    if (target.matches('.more')) { row.querySelector('.row-menu')?.classList.toggle('hidden'); return; }
    if (target.matches('[data-action]')) { const action = target.dataset.action!; await bulk(action, [tabId]); return; }
    await activateTab(tabId);
  });
  $('#tabs').addEventListener('keydown', e => {
    const title = (e.target as HTMLElement).closest<HTMLElement>('.cell-title');
    if (!title) return;
    const event = e as KeyboardEvent;
    const row = title.closest<HTMLElement>('[data-tab-id]');
    if (!row) return;
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void activateTab(Number(row.dataset.tabId)); return; }
    if (event.key !== 'Tab') return;
    const titles = [...$('#tabs').querySelectorAll<HTMLElement>('.cell-title')];
    const index = titles.indexOf(title);
    const next = event.shiftKey ? titles[index - 1] : titles[index + 1];
    if (next) { event.preventDefault(); next.focus(); }
    else if (event.shiftKey && index === 0) { event.preventDefault(); ($('#query') as HTMLInputElement).focus(); }
  });
  $('#tabs').addEventListener('pointerdown', e => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>('.resize-handle');
    if (!handle) return;
    e.preventDefault();
    const index = Number(handle.dataset.column);
    const headingCells = [...$('#tabs').querySelectorAll<HTMLElement>('.tab-heading > .column-heading')];
    const startWidths = columnWidths || headingCells.map(cell => cell.getBoundingClientRect().width);
    const totalWidth = startWidths.reduce((sum, width) => sum + width, 0);
    const minimums = totalWidth < minColumnWidths.reduce((sum, width) => sum + width, 0)
      ? minColumnWidths.map(width => width * totalWidth / minColumnWidths.reduce((sum, value) => sum + value, 0)) : minColumnWidths;
    const startX = e.clientX;
    const move = (event: PointerEvent) => {
      columnWidths = resizeColumns(startWidths, minimums, index, event.clientX - startX);
      applyColumnWidths();
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (columnWidths) localStorage.setItem(widthKey, JSON.stringify(columnWidths));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });
  window.addEventListener('resize', applyColumnWidths);
  $('#tabs').addEventListener('error', e => {
    const target = e.target as HTMLElement;
    if (target.matches('.tab-favicon')) target.remove();
  }, true);
  if (page === 'dashboard') {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { void run(refresh); }, 75); };
    browser.tabs.onCreated.addListener(scheduleRefresh);
    browser.tabs.onRemoved.addListener(scheduleRefresh);
    browser.tabs.onUpdated.addListener(scheduleRefresh);
    browser.storage.onChanged.addListener((changes: any, area: string) => { if (area === 'local' && changes.state) scheduleRefresh(); });
  }
  initTopBar();
}
function notice(message: string, source = 'general') { const status = $('#notice'); status.textContent = message; status.dataset.source = message ? source : ''; }
async function run(fn: () => Promise<void>, source = 'general') { try { await fn(); } catch (e) { notice(String(e), source); } }
async function activateTab(tabId: number) { await run(async () => { await send('focus', { tabId }); if (page === 'popup') window.close(); }); }
async function refresh() { Object.assign(state, await send('snapshot')); selected = new Set([...selected].filter(id => state.tabs.some((t: any) => t.id === id))); applyFontSize(); renderActionOptions(); renderTabs(); renderCollections(); renderTopSites(); await renderWeather(); }
function applyFontSize() {
  const size = [12, 14, 16, 18].includes(state.preferences?.fontSize) ? state.preferences.fontSize : 14;
  document.documentElement.style.fontSize = `${size}px`;
  document.documentElement.style.setProperty('--atm-table-font-size', `${size}px`);
  const table = document.querySelector<HTMLElement>('#tabs');
  if (table) table.style.fontSize = `${size}px`;
  const select = $('#fontSize') as HTMLSelectElement | null;
  if (select) select.value = String(size);
}
function renderActionOptions() {
  const select = $('#bulk') as HTMLSelectElement;
  const current = select.value;
  const usage = state.preferences?.actionUsage || {};
  const useCount = (action: string) => (usage[action] || 0) + (action === 'export' ? usage.exportClose || 0 : 0);
  const ordered = [...bulkActions].sort((a, b) => useCount(b[0]) - useCount(a[0]) || bulkActions.findIndex(item => item[0] === a[0]) - bulkActions.findIndex(item => item[0] === b[0]));
  select.replaceChildren(node('option', { text: 'Actions…', attrs: { value: '' } }), ...ordered.map(([value, label]) => node('option', { text: label, attrs: { value } })));
  if (ordered.some(([value]) => value === current)) select.value = current;
}
function renderTabRow(t: any) {
  const row = node('article', { className: `tab-grid tab-row${t.isLoaded ? '' : ' unloaded'}`, attrs: { role: 'row', title: String(t.url || '') }, data: { tabId: String(t.id) } });
  const checkCell = node('span', { className: 'cell-check', attrs: { role: 'cell' } });
  const checkbox = node('input', { attrs: { type: 'checkbox', 'aria-label': `Select ${t.title || ''}` } });
  checkbox.checked = selected.has(t.id);
  checkCell.append(checkbox);
  const iconCell = node('span', { className: 'cell-icon', attrs: { role: 'cell' } });
  iconCell.append(tabIcon(t.favIconUrl));
  const title = node('strong', { className: 'cell-title', attrs: { role: 'cell', tabindex: '0' } });
  title.append(node('span', { className: 'title-text', text: t.title || t.url || 'Untitled tab' }));
  for (const [show, label, symbol] of [[t.pinned, 'Pinned', '●'], [t.audible, 'Audible', '♪'], [t.mutedInfo?.muted, 'Muted', '×'], [t.discarded, 'Unloaded', '○']] as const) {
    if (show) title.append(node('span', { className: 'flag', text: symbol, attrs: { 'aria-label': label } }));
  }
  const menu = node('div', { className: 'row-menu hidden' });
  for (const [action, label] of [['saveCollection', 'Save'], ['discard', 'Unload'], ['close', 'Close']]) menu.append(node('button', { text: label, data: { action } }));
  row.append(checkCell, iconCell, title,
    node('span', { className: 'cell-url', text: displayUrl(t.url), attrs: { role: 'cell' } }),
    node('span', { className: 'cell-date', text: firstSeenDisplay(t.firstSeen), attrs: { role: 'cell' } }),
    node('span', { className: 'cell-date', text: lastActive(t.lastAccess), attrs: { role: 'cell' } }),
    node('span', { className: 'cell-center', text: String(t.windowId), attrs: { role: 'cell' } }),
    node('button', { className: 'more', text: '⋮', attrs: { 'aria-label': 'Tab actions' } }), menu);
  return row;
}
function renderTabs() {
  const loadFilter = ($('#loadFilter') as HTMLSelectElement).value;
  const tabsByLoad = state.tabs.filter((tab: any) => loadFilter === 'all' || (loadFilter === 'loaded' ? tab.isLoaded : !tab.isLoaded));
  filtered = filterAndSortTabs(tabsByLoad, {
    query: ($('#query') as HTMLInputElement).value,
    queryMode: ($('#queryMode') as HTMLSelectElement).value as 'is' | 'not',
    sort: currentSort,
    sortDirection,
    ageMode: ($('#ageMode') as HTMLSelectElement).value as 'any' | 'older' | 'newer',
    ageDays: Number(($('#agePeriod') as HTMLSelectElement).value),
    accessMode: ($('#accessMode') as HTMLSelectElement).value as 'any' | 'within' | 'before',
    accessDays: Number(($('#accessPeriod') as HTMLSelectElement).value)
  });
  $('#count').textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'} · ${selected.size} selected`;
  const selectionButton = $('#selectAll') as HTMLButtonElement;
  selectionButton.textContent = selected.size ? 'Clear selection' : 'Select results';
  selectionButton.disabled = !selected.size && !filtered.length;
  ($('#bulkGo') as HTMLButtonElement).disabled = selected.size === 0;
  const header = node('div', { className: 'tab-grid tab-heading', attrs: { role: 'row' } });
  header.append(heading('', undefined, 0), heading('', undefined, 1), heading('Title', 'title', 2), heading('URL', 'url', 3), heading('Age', 'firstSeen', 4), heading('Last active', 'lastAccess', 5), heading('Window', 'windowId', 6), heading('', undefined, 7));
  $('#tabs').replaceChildren(header, ...(filtered.length ? filtered.map(renderTabRow) : [node('p', { className: 'empty', text: 'No matching tabs' })]));
  applyColumnWidths();
}
async function bulk(action: string, override?: number[]) {
  const usageAction = action;
  const ids = override || [...selected];
  if (!ids.length) return notice('No tabs selected.', 'action');
  let payload: any = { tabIds: ids };
  if (action === 'saveCollection' || action === 'saveClose') {
    const name = prompt('Collection name', `Collection ${new Date().toLocaleDateString()}`); if (!name) return;
    payload.name = name; payload.close = action === 'saveClose'; action = 'saveCollection';
  }
  if (action === 'move') {
    payload.newWindow = true;
    payload.windowId = 'new';
    payload.tabIds = filtered.filter(t => ids.includes(t.id)).map(t => t.id);
  }
  if (['close','duplicates'].includes(action) || payload.close) {
    if (!confirm(`Proceed with ${action} for ${action === 'duplicates' ? 'all duplicate tabs' : `${ids.length} tab(s)`}?`)) return;
  }
  await run(async () => { const result = await send(action, payload); await send('recordActionUsage', { action: usageAction }); notice(result?.errors ? `${result.count} completed. ${result.errors.join(' ')}` : 'Done.', 'action'); selected.clear(); await refresh(); }, 'action');
}
function initTopBar() {
  const menu = $('#dashboardMenu');
  const menuButton = $('#dashboardMenuButton');
  const dropdowns = [...document.querySelectorAll<HTMLDetailsElement>('.top-dropdown')];
  const closeMenu = () => { menu.classList.add('hidden'); menuButton.setAttribute('aria-expanded', 'false'); };
  $('#resetColumns').addEventListener('click', () => {
    columnWidths = undefined;
    localStorage.removeItem(widthKey);
    $('#tabs').style.removeProperty('--tab-columns');
    renderTabs();
    notice('Column widths reset.');
  });
  $('#fontSize').addEventListener('change', e => run(async () => {
    const fontSize = Number((e.target as HTMLSelectElement).value);
    await send('setFontSize', { fontSize });
    state.preferences.fontSize = fontSize;
    applyFontSize();
    renderTabs();
  }));
  menuButton.addEventListener('click', () => {
    menu.classList.toggle('hidden');
    menuButton.setAttribute('aria-expanded', String(!menu.classList.contains('hidden')));
    if (!menu.classList.contains('hidden')) dropdowns.forEach(dropdown => { dropdown.open = false; });
  });
  dropdowns.forEach(dropdown => dropdown.addEventListener('toggle', () => {
    if (dropdown.open) { closeMenu(); dropdowns.filter(other => other !== dropdown).forEach(other => { other.open = false; }); }
  }));
  document.addEventListener('pointerdown', e => {
    const target = e.target as Node;
    if (!document.querySelector('.dashboard-menu-wrap')?.contains(target)) closeMenu();
    dropdowns.filter(dropdown => !dropdown.contains(target)).forEach(dropdown => { dropdown.open = false; });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!menu.classList.contains('hidden')) { closeMenu(); menuButton.focus(); e.preventDefault(); }
    else {
      const openDropdown = dropdowns.find(dropdown => dropdown.open);
      if (openDropdown) { openDropdown.open = false; openDropdown.querySelector<HTMLElement>('summary')?.focus(); e.preventDefault(); }
    }
  });
  $('#import').addEventListener('click', () => run(async () => {
    const file = ($('#importFile') as HTMLInputElement).files?.[0]; if (!file) throw Error('Choose a text file first.');
    const { urls, invalid } = parseUrlFile(await file.text());
    if (urls.length > 1000) throw Error('Import limit is 1,000 URLs.');
    if (!urls.length) throw Error(`No valid HTTP(S) URLs. ${invalid.length} invalid lines.`);
    const name = prompt('Collection name', file.name.replace(/\.txt$/i, '')); if (!name) return;
    await send('importCollection', { name, urls }); notice(`Imported ${urls.length} URLs. ${invalid.length} invalid lines skipped.`); await refresh();
  }));
  $('#collections').addEventListener('click', e => run(async () => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-collection-action]'); if (!button) return;
    const collectionId = button.dataset.collectionId!, action = button.dataset.collectionAction!;
    if (action === 'delete' && !confirm('Delete this collection?')) return;
    if (action === 'delete') await send('deleteCollection', { collectionId });
    else if (action === 'pin') await send('pinCollection', { collectionId });
    else await send('openCollection', { collectionId, newWindow: action === 'new', url: button.dataset.url });
    await refresh();
  }));
  $('#topSites').addEventListener('click', e => run(async () => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-site-action]'); if (!button) return;
    const action = button.dataset.siteAction!, url = button.dataset.url!;
    await send('topSitePreference', { preference: action === 'delete' ? 'hidden' : 'pinned', url, enabled: action === 'delete' || !state.preferences.pinnedTopSites.includes(url) });
    await refresh();
  }));
  $('#topSites').addEventListener('error', e => {
    const target = e.target as HTMLElement;
    if (target.matches('.tab-favicon')) target.remove();
  }, true);
  $('#removedTopSites').addEventListener('click', e => run(async () => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-restore-site]'); if (!button) return;
    await send('topSitePreference', { preference: 'hidden', url: button.dataset.restoreSite, enabled: false });
    await refresh();
  }));
  void run(async () => {
    const raw = await browser.topSites.get({ includeFavicon: true });
    const unique = new Map<string, any>();
    for (const site of raw) {
      const url = rootDomainUrl(site.url); if (!url) continue;
      const existing = unique.get(url);
      const title = frequentSiteDisplayName(site.url);
      if (!existing) unique.set(url, { url, title, favicon: site.favicon, shortened: /^www\./i.test(new URL(site.url).hostname) });
      else {
        if (!existing.favicon && site.favicon) existing.favicon = site.favicon;
        if (!existing.shortened && /^www\./i.test(new URL(site.url).hostname)) { existing.title = title; existing.shortened = true; }
      }
    }
    topSites = [...unique.values()]; renderTopSites();
  });
}
function renderCollections() {
  const collections = [...state.collections].sort((a: any, b: any) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt);
  if (!collections.length) { $('#collections').replaceChildren(node('p', { text: 'No collections saved yet.' })); return; }
  $('#collections').replaceChildren(...collections.map((c: any) => {
    const container = node('div', { className: 'collection' });
    const itemHeading = node('div', { className: 'item-heading' });
    const icons = node('span', { className: 'item-icons' });
    const pinLabel = c.pinned ? 'Unpin' : 'Pin';
    icons.append(
      node('button', { text: c.pinned ? '📌' : '📍', attrs: { title: `${pinLabel} collection`, 'aria-label': `${pinLabel} ${c.name}` }, data: { collectionAction: 'pin', collectionId: String(c.id) } }),
      node('button', { text: '🗑️', attrs: { title: 'Delete collection', 'aria-label': `Delete ${c.name}` }, data: { collectionAction: 'delete', collectionId: String(c.id) } })
    );
    itemHeading.append(node('strong', { text: c.name }), icons);
    const actions = node('div', { className: 'row' });
    actions.append(node('button', { text: 'Open all here', data: { collectionAction: 'current', collectionId: String(c.id) } }), node('button', { text: 'Open in new window', data: { collectionAction: 'new', collectionId: String(c.id) } }));
    const details = node('details');
    details.append(node('summary', { text: 'URLs' }));
    for (const tab of c.tabs) {
      const entry = node('div', { className: 'collection-url' });
      entry.append(node('button', { text: 'Open', data: { collectionAction: 'current', collectionId: String(c.id), url: String(tab.url) } }), node('span', { text: tab.title }));
      details.append(entry);
    }
    container.append(itemHeading, node('small', { text: `${c.tabs.length} URLs · ${when(c.createdAt)}` }), actions, details);
    return container;
  }));
}
function renderTopSites() {
  const hidden = new Set(state.preferences?.hiddenTopSites || []), pinned = new Set(state.preferences?.pinnedTopSites || []);
  const visible = topSites.filter(site => !hidden.has(site.url)).sort((a, b) => Number(pinned.has(b.url)) - Number(pinned.has(a.url)) || a.title.localeCompare(b.title)).slice(0, 12);
  $('#topSites').replaceChildren(...(visible.length ? visible.map(site => {
    const entry = node('div', { className: 'top-site' });
    const link = node('a', { text: site.title, attrs: { href: site.url, title: site.url, target: '_blank', rel: 'noopener noreferrer' } });
    const icons = node('span', { className: 'item-icons' });
    const pinLabel = pinned.has(site.url) ? 'Unpin' : 'Pin';
    icons.append(node('button', { text: pinned.has(site.url) ? '📌' : '📍', attrs: { title: `${pinLabel} site`, 'aria-label': `${pinLabel} ${site.title}` }, data: { siteAction: 'pin', url: site.url } }), node('button', { text: '🗑️', attrs: { title: 'Remove site', 'aria-label': `Remove ${site.title}` }, data: { siteAction: 'delete', url: site.url } }));
    entry.append(tabIcon(site.favicon), link, icons);
    return entry;
  }) : [node('p', { text: 'No frequent sites available.' })]));
  const removed = topSites.filter(site => hidden.has(site.url));
  $('#removedTopSites').replaceChildren(...(removed.length ? removed.map(site => {
    const entry = node('div', { className: 'top-site' });
    entry.append(tabIcon(site.favicon), node('span', { className: 'site-label', text: site.title }), node('button', { text: 'Restore', data: { restoreSite: site.url } }));
    return entry;
  }) : [node('small', { text: 'No removed sites.' })]));
}
function weatherCondition(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Clear' };
  if (code <= 3) return { icon: '⛅', label: 'Cloudy' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '❄️', label: 'Snow' };
  if ([95, 96, 99].includes(code)) return { icon: '⛈️', label: 'Thunderstorm' };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: '🌧️', label: 'Rain' };
  return { icon: '🌤️', label: 'Weather' };
}
const degrees = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}°` : '—';
async function renderWeather() {
  const box = $('#weather');
  const summary = $('#weatherSummary');
  if (!state.weather?.enabled) { summary.textContent = 'Weather off'; delete summary.dataset.location; }
  else if (!state.weather?.location) { summary.textContent = 'Choose city in Menu'; delete summary.dataset.location; }
  else if (summary.dataset.location !== state.weather.location.name) summary.textContent = 'Loading weather…';
  const enabledLabel = node('label');
  const enabledInput = node('input', { attrs: { type: 'checkbox', id: 'weatherEnabled' } });
  enabledInput.checked = !!state.weather?.enabled;
  enabledLabel.append(enabledInput, document.createTextNode(' Enable weather'));
  const searchRow = node('div', { className: 'row' });
  searchRow.append(node('input', { attrs: { id: 'place', placeholder: 'City or postal code' } }), node('button', { text: 'Find', attrs: { id: 'findPlace' } }));
  box.replaceChildren(enabledLabel, searchRow, node('div', { attrs: { id: 'placeResults' } }), node('div', { attrs: { id: 'conditions' } }), node('small', { text: 'Weather by Open-Meteo. Your entered location is sent to its service.' }));
  $('#weatherEnabled').addEventListener('change', e => run(async () => {
    const enabled = (e.target as HTMLInputElement).checked;
    if (enabled) {
      const ok = await browser.permissions.request({ data_collection: ['locationInfo'] });
      if (!ok) { (e.target as HTMLInputElement).checked = false; return notice('Weather permission was not granted.'); }
    } else await browser.permissions.remove({ data_collection: ['locationInfo'] });
    state.weather = { ...state.weather, enabled }; await send('weatherSettings', { weather: state.weather });
    if (enabled) await loadWeather(); else { summary.textContent = 'Weather off'; delete summary.dataset.location; $('#conditions').textContent = ''; }
  }));
  $('#findPlace').addEventListener('click', () => run(async () => {
    if (!state.weather.enabled) throw Error('Enable weather first.');
    if (!(await browser.permissions.contains({ data_collection: ['locationInfo'] }))) throw Error('Location consent is off.');
    const name = ($('#place') as HTMLInputElement).value.trim(); if (name.length < 2) throw Error('Enter a city or postal code.');
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8`);
    if (!response.ok) throw Error('Location search failed.');
    const data = await response.json();
    const results = $('#placeResults');
    const places = Array.isArray(data.results) ? data.results : [];
    results.replaceChildren(...(places.length ? places.map((p: any, i: number) => node('button', { text: [p.name, p.admin1, p.country].filter(Boolean).join(', '), data: { place: String(i) } })) : [document.createTextNode('No matching locations.')]));
    $('#placeResults').querySelectorAll<HTMLElement>('[data-place]').forEach(button => button.addEventListener('click', () => run(async () => {
      const p = data.results[Number(button.dataset.place)];
      state.weather.location = { name: [p.name,p.admin1,p.country].filter(Boolean).join(', '), latitude: p.latitude, longitude: p.longitude };
      await send('weatherSettings', { weather: state.weather }); $('#placeResults').textContent = ''; await loadWeather();
    })));
  }));
}
async function loadWeather() {
  const summary = $('#weatherSummary');
  const location = state.weather?.location;
  if (!state.weather?.enabled || !location) { summary.textContent = state.weather?.enabled ? 'Choose city in Menu' : 'Weather off'; return; }
  summary.textContent = 'Loading weather…';
  if (!(await browser.permissions.contains({ data_collection: ['locationInfo'] }))) { summary.textContent = 'Weather unavailable'; $('#conditions').textContent = 'Location consent is off.'; return; }
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`);
    if (!response.ok) throw Error('Weather is unavailable right now.');
    const data = await response.json();
    const condition = weatherCondition(data.current.weather_code);
    const city = location.name.split(',')[0];
    const current = degrees(data.current.temperature_2m);
    const high = degrees(data.daily?.temperature_2m_max?.[0]);
    const low = degrees(data.daily?.temperature_2m_min?.[0]);
    summary.dataset.location = location.name;
    summary.title = `${location.name} · ${condition.label}`;
    summary.replaceChildren(
      node('span', { className: 'weather-icon', text: condition.icon, attrs: { role: 'img', 'aria-label': condition.label } }),
      node('span', { className: 'weather-city', text: city }),
      node('strong', { text: current }),
      node('span', { className: 'weather-range', text: `H ${high} · L ${low}` })
    );
    $('#conditions').textContent = `${location.name}: ${condition.label} · Current ${current}F · High ${high}F · Low ${low}F`;
  } catch (error) {
    summary.textContent = 'Weather unavailable';
    $('#conditions').textContent = String(error);
  }
}

layout();
if (page === 'popup') document.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) window.close(); });
void run(async () => { await refresh(); if (state.weather?.enabled) await loadWeather(); ($('#query') as HTMLInputElement).focus(); });
