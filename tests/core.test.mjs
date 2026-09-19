import test from 'node:test';
import assert from 'node:assert/strict';
import { urlKey, parseUrlFile, prune, chooseDuplicateSurvivors, filterAndSortTabs, firstSeenAgeLabel, fitColumnWidths, resizeColumns, displayUrl, rootDomainUrl, frequentSiteDisplayName, retentionElapsed, checkpointRetention, selectorBounds, RETENTION_MS } from '../dist/core.mjs';

test('URL keys strip only known tracking parameters', () => {
  assert.equal(urlKey('https://example.com/a?x=1&utm_source=mail&fbclid=abc#part'), 'https://example.com/a?x=1#part');
  assert.equal(urlKey('https://example.com/a?video=42'), 'https://example.com/a?video=42');
});
test('table URLs are compact and frequent sites collapse to root origins', () => {
  assert.equal(displayUrl('https://www.example.com/a?q=1'), 'example.com/a?q=1');
  assert.equal(displayUrl('http://www.example.com/a'), 'http://www.example.com/a');
  assert.equal(rootDomainUrl('https://www.example.com/a?q=1'), 'https://example.com/');
  assert.equal(rootDomainUrl('about:config'), null);
  assert.equal(frequentSiteDisplayName('https://www.example.com/a?q=1'), 'Example');
  assert.equal(frequentSiteDisplayName('https://developer.mozilla.org/'), 'developer.mozilla.org');
});
test('selector uses 15 percent horizontal and 10 percent vertical insets', () => {
  assert.deepEqual(selectorBounds({ left: 100, top: 50, width: 1200, height: 900 }), { left: 280, top: 140, width: 840, height: 720 });
});
test('URL list rejects unsafe and malformed lines', () => {
  const parsed = parseUrlFile('# comment\nhttps://example.com\n javascript:alert(1)\nnope\nhttp://mozilla.org');
  assert.deepEqual(parsed.urls, ['https://example.com/', 'http://mozilla.org/']);
  assert.deepEqual(parsed.invalid.map(x => x.line), [3, 4]);
});
test('retention expires closed records, URL usage and undo together', () => {
  const now = 10 * RETENTION_MS;
  const closed = { fresh: { closedAtActiveMs: now - RETENTION_MS + 1 }, stale: { closedAtActiveMs: now - RETENTION_MS } };
  const usage = { fresh: { closedAtActiveMs: now - RETENTION_MS + 1 }, stale: { closedAtActiveMs: now - RETENTION_MS }, open: { activations: 1 } };
  const result = prune({ closed, usage, undo: [{ atActiveMs: now - RETENTION_MS }, { atActiveMs: now - 1 }], collections: [], retention: { elapsedMs: now } }, now);
  assert.deepEqual(Object.keys(result.closed), ['fresh']);
  assert.deepEqual(Object.keys(result.usage).sort(), ['fresh', 'open']);
  assert.equal(result.undo.length, 1);
});
test('three-day expiry pauses with no non-private window while last access keeps wall time', () => {
  const hour = 60 * 60 * 1000;
  const week = 7 * 24 * hour;
  const lastAccess = 100 * hour;
  const closedAtActiveMs = 2 * hour;
  const beforeShutdown = checkpointRetention({ elapsedMs: 2 * hour, activeSince: lastAccess }, lastAccess + hour);
  const paused = { elapsedMs: beforeShutdown.elapsedMs };
  const reopenedAt = lastAccess + hour + week;
  assert.equal(retentionElapsed(paused, reopenedAt), 3 * hour);
  const store = { closed: { tab: { closedAtActiveMs } }, usage: { youtube: { lastAccess, activations: 1, closedAtActiveMs } }, undo: [{ atActiveMs: closedAtActiveMs }], collections: [], retention: paused };
  const kept = prune(store, retentionElapsed(paused, reopenedAt));
  assert.ok(kept.closed.tab);
  assert.equal(kept.usage.youtube.lastAccess, lastAccess);
  assert.equal((reopenedAt - kept.usage.youtube.lastAccess) / (24 * hour), 7 + 1 / 24);
  assert.equal(kept.undo.length, 1);
  const resumed = { elapsedMs: paused.elapsedMs, activeSince: reopenedAt };
  assert.ok(prune(kept, retentionElapsed(resumed, reopenedAt + RETENTION_MS)).closed.tab === undefined);
});
test('duplicate policy prefers focused active, then most recent access', () => {
  const tabs = [
    { id: 1, url: 'https://a', active: false, windowId: 1, lastAccess: 9 },
    { id: 2, url: 'https://a', active: true, windowId: 2, lastAccess: 1 },
    { id: 3, url: 'https://a', active: false, windowId: 3, lastAccess: 10 },
    { id: 4, url: 'https://b', active: false, windowId: 1 }
  ];
  assert.deepEqual(chooseDuplicateSurvivors(tabs, 2).sort(), [1, 3]);
  assert.deepEqual(chooseDuplicateSurvivors(tabs, 3).sort(), [1, 2]);
});
test('filtering respects first-seen age and shared access cutoffs', () => {
  const now = new Date('2026-09-18T12:00:00').getTime();
  const tabs = [
    { id: 1, title: 'YouTube old', url: 'https://youtube.com/a', firstSeen: now - 8 * 86400000, lastAccess: now - 4 * 86400000 },
    { id: 2, title: 'YouTube new', url: 'https://youtube.com/b', firstSeen: now - 86400000, lastAccess: now - 86400000 },
    { id: 3, title: 'Other', url: 'https://example.com', firstSeen: now, lastAccess: undefined }
  ];
  const base = { query: 'youtube', sort: 'lastAccess', ageMode: 'any', ageDays: 7, accessMode: 'any', accessDays: 3 };
  assert.deepEqual(filterAndSortTabs(tabs, base, now).map(t => t.id), [2, 1]);
  assert.deepEqual(filterAndSortTabs(tabs, { ...base, accessMode: 'before' }, now).map(t => t.id), [1]);
  for (const ageDays of [1, 3, 7, 30]) {
    const cutoff = now - ageDays * 86400000;
    const boundaryTabs = [
      { id: 4, title: 'Boundary', firstSeen: cutoff - 1 },
      { id: 5, title: 'Boundary', firstSeen: cutoff },
      { id: 6, title: 'Boundary', firstSeen: cutoff + 1 }
    ];
    assert.deepEqual(filterAndSortTabs(boundaryTabs, { ...base, query: '', ageMode: 'older', ageDays }, now).map(t => t.id), [4]);
    assert.deepEqual(filterAndSortTabs(boundaryTabs, { ...base, query: '', ageMode: 'newer', ageDays }, now).map(t => t.id), [5, 6]);
  }
});

test('default any-age and any-time modes bypass their period filters', () => {
  const now = new Date('2026-09-18T12:00:00').getTime();
  const tabs = [
    { id: 1, title: 'Old and accessed', firstSeen: now - 365 * 86400000, lastAccess: now - 365 * 86400000 },
    { id: 2, title: 'New and accessed', firstSeen: now, lastAccess: now },
    { id: 3, title: 'No access record', firstSeen: now - 10 * 86400000 }
  ];
  const result = filterAndSortTabs(tabs, {
    query: '', sort: 'id', sortDirection: 'asc',
    ageMode: 'any', ageDays: 1,
    accessMode: 'any', accessDays: 1
  }, now);
  assert.deepEqual(result.map(tab => tab.id), [1, 2, 3]);
});

test('window search argument filters by Firefox window ID', () => {
  const tabs = [
    { id: 1, windowId: 12, title: 'YouTube video', url: 'https://youtube.com/a', firstSeen: 1 },
    { id: 2, windowId: 13, title: 'YouTube video', url: 'https://youtube.com/b', firstSeen: 1 },
    { id: 3, windowId: 12, title: 'Documentation', url: 'https://example.com', firstSeen: 1 }
  ];
  const base = { sort: 'id', sortDirection: 'asc', ageMode: 'any', ageDays: 1, accessMode: 'any', accessDays: 1 };
  assert.deepEqual(filterAndSortTabs(tabs, { ...base, query: 'window:12' }).map(tab => tab.id), [1, 3]);
  assert.deepEqual(filterAndSortTabs(tabs, { ...base, query: 'youtube window:12' }).map(tab => tab.id), [1]);
  assert.deepEqual(filterAndSortTabs(tabs, { ...base, query: 'WINDOW:13 youtube' }).map(tab => tab.id), [2]);
});

test('Not search mode excludes the matching text and window expression', () => {
  const tabs = [
    { id: 1, windowId: 12, title: 'YouTube video', url: 'https://youtube.com/a', firstSeen: 1 },
    { id: 2, windowId: 13, title: 'YouTube video', url: 'https://youtube.com/b', firstSeen: 1 },
    { id: 3, windowId: 12, title: 'Documentation', url: 'https://example.com', firstSeen: 1 }
  ];
  const base = { sort: 'id', sortDirection: 'asc', ageMode: 'any', ageDays: 1, accessMode: 'any', accessDays: 1 };
  assert.deepEqual(filterAndSortTabs(tabs, { ...base, query: 'youtube', queryMode: 'not' }).map(tab => tab.id), [3]);
  assert.deepEqual(filterAndSortTabs(tabs, { ...base, query: 'youtube window:12', queryMode: 'not' }).map(tab => tab.id), [2, 3]);
  assert.deepEqual(filterAndSortTabs(tabs, { ...base, query: '', queryMode: 'not' }).map(tab => tab.id), [1, 2, 3]);
});

test('sorting reverses each displayed field when direction toggles', () => {
  const tabs = [
    { id: 1, title: 'Alpha', firstSeen: 1, lastAccess: 3, windowId: 2, isLoaded: true, url: 'https://a.example' },
    { id: 2, title: 'Zulu', firstSeen: 3, lastAccess: 1, windowId: 1, isLoaded: false, url: 'https://z.example' }
  ];
  const base = { query: '', sort: 'title', ageMode: 'any', ageDays: 1, accessMode: 'any', accessDays: 1 };
  for (const sort of ['title', 'firstSeen', 'lastAccess', 'windowId', 'isLoaded', 'url']) {
    const ascending = filterAndSortTabs(tabs, { ...base, sort, sortDirection: 'asc' }).map(tab => tab.id);
    const descending = filterAndSortTabs(tabs, { ...base, sort, sortDirection: 'desc' }).map(tab => tab.id);
    assert.deepEqual(descending, [...ascending].reverse(), sort);
  }
});

test('equal primary values sort by last active and then title', () => {
  const tabs = [
    { id: 1, title: 'Zulu', url: 'https://same', firstSeen: 1, windowId: 1, lastAccess: 5 },
    { id: 2, title: 'Beta', url: 'https://same', firstSeen: 1, windowId: 1, lastAccess: 10 },
    { id: 3, title: 'Alpha', url: 'https://same', firstSeen: 1, windowId: 1, lastAccess: 10 }
  ];
  const options = { query: '', sort: 'windowId', sortDirection: 'asc', ageMode: 'any', ageDays: 1, accessMode: 'any', accessDays: 1 };
  assert.deepEqual(filterAndSortTabs(tabs, options).map(tab => tab.id), [3, 2, 1]);
});

test('first-seen age switches from hours to days without calendar dates', () => {
  const now = 100 * 86400000;
  assert.equal(firstSeenAgeLabel(now, now), '0h');
  assert.equal(firstSeenAgeLabel(now - 86400000 + 1, now), '23h');
  assert.equal(firstSeenAgeLabel(now - 86400000, now), '1d');
  assert.equal(firstSeenAgeLabel(now - 7 * 86400000 + 1, now), '6d');
  assert.equal(firstSeenAgeLabel(now - 7 * 86400000, now), '7d');
  assert.equal(firstSeenAgeLabel(now - 30 * 86400000, now), '30d');
});

test('column resize keeps total width fixed and distributes the change to the right', () => {
  const widths = [22, 200, 80, 90, 180, 55, 60, 28];
  const minimums = [22, 100, 70, 76, 100, 48, 48, 28];
  const resized = resizeColumns(widths, minimums, 1, 40);
  assert.equal(resized[0], widths[0]);
  assert.equal(resized[1], 240);
  assert.ok(resized.slice(2, 7).every((width, i) => width < widths[i + 2]));
  assert.ok(Math.abs(resized.reduce((sum, width) => sum + width, 0) - widths.reduce((sum, width) => sum + width, 0)) < 0.001);
  const clamped = resizeColumns(widths, minimums, 1, 1000);
  assert.ok(clamped.every((width, i) => width >= minimums[i] - 0.001));
  const fitted = fitColumnWidths(widths, minimums, 600);
  assert.ok(Math.abs(fitted.reduce((sum, width) => sum + width, 0) - 600) < 0.001);
  const narrow = fitColumnWidths(widths, minimums, 400);
  assert.equal(narrow[0], widths[0]);
  assert.ok(Math.abs(narrow.reduce((sum, width) => sum + width, 0) - 400) < 0.001);
  assert.deepEqual(resizeColumns(widths, minimums, 0, 30), widths);
  const nineWidths = [22, 28, 180, 80, 90, 180, 70, 80, 28];
  const nineMinimums = [22, 28, 100, 100, 40, 76, 48, 64, 28];
  const rightmost = resizeColumns(nineWidths, nineMinimums, 7, 12);
  assert.equal(rightmost[0], 22, 'checkbox column remains fixed');
  assert.equal(rightmost[7], 92, 'rightmost data column expands');
  assert.equal(rightmost[8], 28, 'actions column remains fixed');
  assert.ok(Math.abs(rightmost.reduce((sum, width) => sum + width, 0) - nineWidths.reduce((sum, width) => sum + width, 0)) < 0.001);
});
