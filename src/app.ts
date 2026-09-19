import { parseUrlFile, filterAndSortTabs, defaultSortDirection, firstSeenAgeLabel, fitColumnWidths, resizeColumns, displayUrl, rootDomainUrl, type SortDirection } from './core';
declare const browser: any;
const $ = (selector: string) => document.querySelector(selector) as HTMLElement;
const page = document.body.dataset.page;
const state: any = { tabs: [], collections: [], undo: [], focusedWindowId: -1, weather: { enabled: false }, preferences: { hiddenTopSites: [], pinnedTopSites: [], actionUsage: {} } };
const bulkActions = [
  ['close', 'Close'], ['discard', 'Unload'], ['saveCollection', 'Save collection'], ['saveClose', 'Save and close'],
  ['export', 'Export URLs'], ['move', 'Combine tabs'], ['duplicates', 'Close duplicates']
] as const;
let topSites: any[] = [];
let selected = new Set<number>();
let filtered: any[] = [];
let sortDirection: SortDirection = 'desc';
let currentSort = 'lastAccess';
const widthKey = 'advanced-tab-manager-column-widths-v4';
const minColumnWidths = [22, 28, 100, 70, 76, 100, 48, 48, 28];
let columnWidths: number[] | undefined;
try {
  const saved = JSON.parse(localStorage.getItem(widthKey) || 'null');
  if (Array.isArray(saved) && saved.length === 9 && saved.every((width, i) => Number.isFinite(width) && width >= minColumnWidths[i] && width <= 2000)) columnWidths = saved;
} catch { /* Ignore invalid saved layout. */ }
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
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
const domain = (url?: string) => { try { return new URL(url || '').hostname || url || ''; } catch { return url || ''; } };
const favicon = (url?: string) => {
  if (!url) return '';
  if (/^data:image\/(?:png|gif|jpeg|webp|svg\+xml);/i.test(url)) return url;
  try { return ['http:', 'https:', 'moz-extension:'].includes(new URL(url).protocol) ? url : ''; } catch { return ''; }
};
const tabIcon = (url?: string) => {
  const src = favicon(url);
  return `<span class="site-icon" aria-hidden="true"><span class="site-icon-fallback">◉</span>${src ? `<img class="tab-favicon" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
};
const heading = (label: string, field: string | undefined, index: number) => `<span class="column-heading" role="columnheader"${field ? ` aria-sort="${currentSort === field ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}"` : ''}>${field ? `<button class="sort-header" data-sort="${field}" title="Sort by ${label}">${label}<span class="sort-arrow" aria-hidden="true">${currentSort === field ? sortDirection === 'asc' ? '▲' : '▼' : ''}</span></button>` : label}${index > 0 && index < 8 ? `<span class="resize-handle" data-column="${index}" role="separator" aria-label="Resize ${label} column" title="Drag to resize column"></span>` : ''}</span>`;
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
function topBarControls() {
  return `<details class="top-dropdown"><summary>Collections</summary><div class="dropdown-panel collections-panel"><div class="row"><input id="importFile" type="file" accept=".txt,text/plain"><button id="import">Import URL list</button></div><div id="collections"></div></div></details>
    <details class="top-dropdown"><summary>Frequently visited</summary><div id="topSites" class="dropdown-panel"></div></details>
    <div id="weatherSummary" class="weather-summary" role="status">Weather off</div>
    <div class="dashboard-menu-wrap"><button id="dashboardMenuButton" aria-controls="dashboardMenu" aria-expanded="false">☰ Menu</button><div id="dashboardMenu" class="dashboard-menu hidden" role="region" aria-label="More tools"><div class="menu-commands"><button id="undo">Undo</button>${page === 'popup' ? '<button id="dashboard">Dashboard ↗</button>' : ''}</div><details class="settings-page"><summary>Settings</summary><section class="weather-widget"><h2>Weather settings</h2><div id="weather"></div></section><section><h2>Restore frequently visited</h2><div id="removedTopSites"></div></section></details></div></div>`;
}

function layout() {
  $('#app').innerHTML = `<header><div class="header-title"><button id="titleDashboard" class="title-button"><h1>Advanced Tab Manager</h1><small>${page === 'popup' ? 'Find tabs across windows' : 'Your tab workspace'}</small></button></div><div class="header-actions">${topBarControls()}</div></header>
  <section class="search"><div class="search-line"><select id="queryMode" aria-label="Search logical operator"><option value="is">Is</option><option value="not">Not</option></select><input id="query" type="search" placeholder="Search title, URL, or window:#" aria-label="Find tabs" autofocus><div class="filter-stack"><div><label>First seen <select id="ageMode"><option value="any">Any age</option><option value="older">Older than</option><option value="newer">Younger than</option></select></label><select id="agePeriod" aria-label="First seen age period"><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="30">30 days</option></select></div><div><label>Last active <select id="accessMode"><option value="any">Any time</option><option value="within">Within</option><option value="before">Before</option></select></label><select id="accessPeriod" aria-label="Last active period"><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="30">30 days</option></select></div></div></div></section>
  <section class="toolbar"><span id="count"></span><span id="notice" role="status"></span><span class="toolbar-spacer" aria-hidden="true"></span><button id="selectAll">Select results</button><select id="bulk" aria-label="Bulk action"><option value="">Actions…</option></select><button id="bulkGo">Go</button></section>
  <section id="tabs" class="tab-list" role="table" aria-label="Tab results"></section>`;
  $('#query').addEventListener('input', () => { selected.clear(); renderTabs(); });
  $('#queryMode').addEventListener('input', () => { selected.clear(); renderTabs(); });
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
    if (target.matches('.more')) { row.querySelector('.row-menu')?.classList.toggle('hidden'); return; }
    if (target.matches('[data-action]')) { const action = target.dataset.action!; await bulk(action, [tabId]); return; }
    await run(async () => { await send('focus', { tabId }); if (page === 'popup') window.close(); });
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
    browser.storage.onChanged.addListener((changes: any, area: string) => { if (area === 'local' && changes.state) scheduleRefresh(); });
  }
  initTopBar();
}
function notice(message: string, source = 'general') { const status = $('#notice'); status.textContent = message; status.dataset.source = message ? source : ''; }
async function run(fn: () => Promise<void>, source = 'general') { try { await fn(); } catch (e) { notice(String(e), source); } }
async function refresh() { Object.assign(state, await send('snapshot')); selected = new Set([...selected].filter(id => state.tabs.some((t: any) => t.id === id))); renderActionOptions(); renderTabs(); renderCollections(); renderTopSites(); await renderWeather(); }
function renderActionOptions() {
  const select = $('#bulk') as HTMLSelectElement;
  const current = select.value;
  const usage = state.preferences?.actionUsage || {};
  const useCount = (action: string) => (usage[action] || 0) + (action === 'export' ? usage.exportClose || 0 : 0);
  const ordered = [...bulkActions].sort((a, b) => useCount(b[0]) - useCount(a[0]) || bulkActions.findIndex(item => item[0] === a[0]) - bulkActions.findIndex(item => item[0] === b[0]));
  select.innerHTML = `<option value="">Actions…</option>${ordered.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}`;
  if (ordered.some(([value]) => value === current)) select.value = current;
}
function renderTabRow(t: any) {
  return `<article class="tab-grid tab-row" role="row" data-tab-id="${t.id}" title="${esc(t.url || '')}"><span class="cell-check" role="cell"><input type="checkbox" aria-label="Select ${esc(t.title)}" ${selected.has(t.id) ? 'checked' : ''}></span><span class="cell-icon" role="cell">${tabIcon(t.favIconUrl)}</span><strong class="cell-title" role="cell"><span class="title-text">${esc(t.title || t.url || 'Untitled tab')}</span>${t.pinned ? '<span class="flag" aria-label="Pinned">●</span>' : ''}${t.audible ? '<span class="flag" aria-label="Audible">♪</span>' : ''}${t.mutedInfo?.muted ? '<span class="flag" aria-label="Muted">×</span>' : ''}${t.discarded ? '<span class="flag" aria-label="Unloaded">○</span>' : ''}</strong><span class="cell-date" role="cell">${esc(firstSeenDisplay(t.firstSeen))}</span><span class="cell-date" role="cell">${esc(lastActive(t.lastAccess))}</span><span class="cell-url" role="cell">${esc(displayUrl(t.url))}</span><span class="cell-center" role="cell">${t.windowId}</span><span class="cell-center" role="cell">${t.activations || 0}</span><button class="more" aria-label="Tab actions">⋮</button><div class="row-menu hidden"><button data-action="saveCollection">Save</button><button data-action="discard">Unload</button><button data-action="close">Close</button></div></article>`;
}
function renderTabs() {
  filtered = filterAndSortTabs(state.tabs, {
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
  $('#tabs').innerHTML = `<div class="tab-grid tab-heading" role="row">${heading('', undefined, 0)}${heading('', undefined, 1)}${heading('Title', 'title', 2)}${heading('First seen', 'firstSeen', 3)}${heading('Last active', 'lastAccess', 4)}${heading('URL', 'url', 5)}${heading('Window', 'windowId', 6)}${heading('Activity', 'activations', 7)}${heading('', undefined, 8)}</div>` + (filtered.length ? filtered.map(renderTabRow).join('') : '<p class="empty">No matching tabs</p>');
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
      if (!existing) unique.set(url, { url, title: domain(url), favicon: site.favicon });
      else if (!existing.favicon && site.favicon) existing.favicon = site.favicon;
    }
    topSites = [...unique.values()]; renderTopSites();
  });
}
function renderCollections() {
  const collections = [...state.collections].sort((a: any, b: any) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt);
  $('#collections').innerHTML = collections.length ? collections.map((c: any) => `<div class="collection"><div class="item-heading"><strong>${esc(c.name)}</strong><span class="item-icons"><button data-collection-action="pin" data-collection-id="${c.id}" title="${c.pinned ? 'Unpin' : 'Pin'} collection" aria-label="${c.pinned ? 'Unpin' : 'Pin'} ${esc(c.name)}">${c.pinned ? '📌' : '📍'}</button><button data-collection-action="delete" data-collection-id="${c.id}" title="Delete collection" aria-label="Delete ${esc(c.name)}">🗑️</button></span></div><small>${c.tabs.length} URLs · ${esc(when(c.createdAt))}</small><div class="row"><button data-collection-action="current" data-collection-id="${c.id}">Open all here</button><button data-collection-action="new" data-collection-id="${c.id}">Open in new window</button></div><details><summary>URLs</summary>${c.tabs.map((t: any) => `<div class="collection-url"><button data-collection-action="current" data-collection-id="${c.id}" data-url="${esc(t.url)}">Open</button><span>${esc(t.title)}</span></div>`).join('')}</details></div>`).join('') : '<p>No collections saved yet.</p>';
}
function renderTopSites() {
  const hidden = new Set(state.preferences?.hiddenTopSites || []), pinned = new Set(state.preferences?.pinnedTopSites || []);
  const visible = topSites.filter(site => !hidden.has(site.url)).sort((a, b) => Number(pinned.has(b.url)) - Number(pinned.has(a.url)) || a.title.localeCompare(b.title)).slice(0, 12);
  $('#topSites').innerHTML = visible.length ? visible.map(site => `<div class="top-site">${tabIcon(site.favicon)}<a href="${esc(site.url)}" title="${esc(site.url)}" target="_blank" rel="noopener noreferrer">${esc(site.title)}</a><span class="item-icons"><button data-site-action="pin" data-url="${esc(site.url)}" title="${pinned.has(site.url) ? 'Unpin' : 'Pin'} site" aria-label="${pinned.has(site.url) ? 'Unpin' : 'Pin'} ${esc(site.title)}">${pinned.has(site.url) ? '📌' : '📍'}</button><button data-site-action="delete" data-url="${esc(site.url)}" title="Remove site" aria-label="Remove ${esc(site.title)}">🗑️</button></span></div>`).join('') : '<p>No frequent sites available.</p>';
  const removed = topSites.filter(site => hidden.has(site.url));
  $('#removedTopSites').innerHTML = removed.length ? removed.map(site => `<div class="top-site">${tabIcon(site.favicon)}<span class="site-label">${esc(site.title)}</span><button data-restore-site="${esc(site.url)}">Restore</button></div>`).join('') : '<small>No removed sites.</small>';
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
  box.innerHTML = `<label><input type="checkbox" id="weatherEnabled" ${state.weather?.enabled ? 'checked' : ''}> Enable weather</label><div class="row"><input id="place" placeholder="City or postal code"><button id="findPlace">Find</button></div><div id="placeResults"></div><div id="conditions"></div><small>Weather by Open-Meteo. Your entered location is sent to its service.</small>`;
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
    $('#placeResults').innerHTML = (data.results || []).map((p: any, i: number) => `<button data-place="${i}">${esc([p.name,p.admin1,p.country].filter(Boolean).join(', '))}</button>`).join('') || 'No matching locations.';
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
    summary.innerHTML = `<span class="weather-icon" role="img" aria-label="${esc(condition.label)}">${condition.icon}</span><span class="weather-city">${esc(city)}</span><strong>${current}</strong><span class="weather-range">H ${high} · L ${low}</span>`;
    $('#conditions').textContent = `${location.name}: ${condition.label} · Current ${current}F · High ${high}F · Low ${low}F`;
  } catch (error) {
    summary.textContent = 'Weather unavailable';
    $('#conditions').textContent = String(error);
  }
}

layout();
if (page === 'popup') document.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) window.close(); });
void run(async () => { await refresh(); if (state.weather?.enabled) await loadWeather(); ($('#query') as HTMLInputElement).focus(); });
