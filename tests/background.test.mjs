import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

test('session tabs restored after a week retain their records and last-access times', async () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  const currentTime = 2_000_000_000_000;
  let clockTime = currentTime;
  const priorAccess = currentTime - week;
  const urls = ['https://www.youtube.com/watch?v=one', 'https://www.youtube.com/watch?v=two'];
  const tabs = urls.map((url, index) => ({ id: 11 + index, windowId: 1, index, url, title: `Video ${index}`, active: index === 0, status: 'complete', incognito: false, pinned: false }));
  const records = Object.fromEntries(tabs.map((tab, index) => [`record-${index}`, { recordId: `record-${index}`, firstSeen: priorAccess - 1000, url: tab.url, title: tab.title, windowId: 1, index, pinned: false, closedAt: priorAccess, closedAtActiveMs: 60_000 }]));
  let persisted = { open: records, closed: {}, usage: Object.fromEntries(urls.map(url => [url, { lastAccess: priorAccess, activations: 3, closedAt: priorAccess, closedAtActiveMs: 60_000 }])), collections: [], undo: [{ id: 'undo-1', kind: 'close', at: priorAccess, atActiveMs: 0, tabs: [] }], retention: { elapsedMs: 60_000, activeSince: priorAccess } };
  let messageHandler;
  let rawMessageHandler;
  const handlers = {};
  let createdWindow;
  let removedWindowId;
  let incognitoAllowed = true;
  const event = name => ({ addListener(handler) { handlers[name] = handler; } });
  const browser = {
    storage: { local: { async get() { return { state: persisted }; }, async set(value) { persisted = value.state; } }, session: { async get() { return {}; }, async set() {}, async remove() {} } },
    windows: { WINDOW_ID_NONE: -1, async getAll() { return [{ id: 1, type: 'normal', incognito: false, tabs }]; }, async getLastFocused() { return { id: 1 }; }, async get(id) { if (id === 1) return { id, type: 'normal', incognito: false, left: 100, top: 50, width: 1200, height: 900 }; if (id === 2) return { id, type: 'normal', incognito: true, left: 500, top: 200, width: 1000, height: 800 }; return createdWindow; }, async create(options) { createdWindow = { id: 99, type: 'popup', focused: true, ...options }; return createdWindow; }, async update() {}, async remove(id) { removedWindowId = id; }, onFocusChanged: event('focus'), onCreated: event('windowCreated'), onRemoved: event('windowRemoved') },
    tabs: { async get(id) { return tabs.find(tab => tab.id === id); }, async query(query) { return tabs.filter(tab => tab.windowId === query.windowId && tab.active === query.active); }, async create(options) { const tab = { id: 40, windowId: options.windowId, index: tabs.length, url: options.url, title: 'Reopened video', active: !!options.active, status: 'complete', incognito: false, pinned: !!options.pinned }; tabs.push(tab); return tab; }, async update(id, changes) { Object.assign(tabs.find(tab => tab.id === id), changes); }, onCreated: event('tabCreated'), onRemoved: event('tabRemoved'), onUpdated: event('tabUpdated'), onAttached: event('tabAttached'), onMoved: event('tabMoved'), onActivated: event('activated') },
    runtime: { id: 'test-extension', getURL(path) { return `chrome-extension://test/${path}`; }, onMessage: { addListener(handler) {
      rawMessageHandler = handler;
      messageHandler = (message, sender = { id: 'test-extension', url: 'chrome-extension://test/popup.html' }) => new Promise((resolve, reject) => {
        const keepChannelOpen = handler(message, sender, response => response?.__atmError ? reject(Error(response.__atmError)) : resolve(response?.__atmResult));
        if (keepChannelOpen !== true && sender.id === 'test-extension') reject(Error('Message channel was not kept open'));
      });
    } } },
    extension: { async isAllowedIncognitoAccess() { return incognitoAllowed; } },
    action: { onClicked: event('action') }
  };
  class FixedDate extends Date { static now() { return clockTime; } }
  runInNewContext(readFileSync(new URL('../dist/background.js', import.meta.url), 'utf8'), { chrome: browser, crypto: webcrypto, structuredClone, Date: FixedDate, URL, console, setTimeout });
  const snapshot = await messageHandler({ type: 'snapshot' });
  await assert.rejects(messageHandler({ type: 'snapshot' }, { id: 'other-extension', url: 'chrome-extension://other/page.html' }), /Untrusted message sender/);
  assert.equal(snapshot.tabs.length, 2);
  assert.deepEqual(snapshot.tabs.map(tab => tab.isLoaded), [true, true]);
  assert.deepEqual(snapshot.tabs.map(tab => tab.lastAccess), [priorAccess, priorAccess]);
  assert.deepEqual(snapshot.tabs.map(tab => tab.firstSeen), [priorAccess - 1000, priorAccess - 1000]);
  assert.equal(Object.keys(persisted.closed).length, 0);
  assert.ok(persisted.retention.elapsedMs < 61_000, 'offline week did not count toward retention');
  handlers.focus(1);
  handlers.activated({ tabId: 11, windowId: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(persisted.usage[urls[0]].lastAccess, priorAccess, 'startup focus did not count as a visit');
  handlers.windowRemoved(1);
  await new Promise(resolve => setImmediate(resolve));
  const elapsedAtClose = persisted.retention.elapsedMs;
  clockTime += week;
  const pausedSnapshot = await messageHandler({ type: 'snapshot' });
  assert.equal(persisted.retention.elapsedMs, elapsedAtClose);
  assert.equal(pausedSnapshot.undo.length, 1, 'undo retention paused with no normal window');
  assert.equal(pausedSnapshot.tabs[0].lastAccess, priorAccess);
  handlers.windowCreated({ id: 2, type: 'normal', incognito: false });
  await new Promise(resolve => setImmediate(resolve));
  clockTime += 3 * 24 * 60 * 60 * 1000;
  assert.equal((await messageHandler({ type: 'snapshot' })).undo.length, 0, 'retention resumed after normal window opened');
  handlers.action(tabs[0]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([createdWindow.left, createdWindow.top, createdWindow.width, createdWindow.height], [280, 140, 840, 720]);
  assert.equal(createdWindow.incognito, true, 'selector requests a private browsing window');
  handlers.focus(99);
  await new Promise(resolve => setImmediate(resolve));
  handlers.focus(-1);
  await new Promise(resolve => setTimeout(resolve, 125));
  assert.equal(removedWindowId, undefined, 'temporary focus loss inside the popup does not close it');
  handlers.focus(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(removedWindowId, 99, 'selector closes after focus leaves it');
  incognitoAllowed = false;
  removedWindowId = undefined;
  handlers.action(tabs[0]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(createdWindow.incognito, false, 'selector falls back to normal browsing without private access');
  handlers.focus(99);
  handlers.focus(1);
  await new Promise(resolve => setImmediate(resolve));
  incognitoAllowed = true;
  handlers.action({ windowId: 2 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(createdWindow.incognito, true, 'private source creates a private selector');
  assert.deepEqual([createdWindow.left, createdWindow.top, createdWindow.width, createdWindow.height], [650, 280, 700, 640], 'private source bounds position the selector');
  handlers.focus(99);
  handlers.focus(1);
  await new Promise(resolve => setImmediate(resolve));
  const closing = tabs.shift();
  handlers.tabRemoved(closing.id);
  await new Promise(resolve => setImmediate(resolve));
  const afterClose = await messageHandler({ type: 'snapshot' });
  assert.deepEqual(afterClose.tabs.map(tab => tab.id), [12], 'closed tabs leave the table snapshot');
  assert.equal('closedTabs' in afterClose, false);
  const opened = await browser.tabs.create({ windowId: 1, url: 'https://example.com/new', active: false });
  handlers.tabCreated(opened);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual((await messageHandler({ type: 'snapshot' })).tabs.map(tab => tab.id), [12, 40], 'new tabs enter the table snapshot');
  const collection = await messageHandler({ type: 'importCollection', name: 'Pinned set', urls: ['https://example.com/'] });
  await messageHandler({ type: 'pinCollection', collectionId: collection.id });
  await messageHandler({ type: 'topSitePreference', preference: 'hidden', url: 'https://example.com/', enabled: true });
  const preferenceSnapshot = await messageHandler({ type: 'snapshot' });
  assert.equal(preferenceSnapshot.collections[0].pinned, true);
  assert.deepEqual(Array.from(preferenceSnapshot.preferences.hiddenTopSites), ['https://example.com/']);
  await messageHandler({ type: 'recordActionUsage', action: 'move' });
  await messageHandler({ type: 'recordActionUsage', action: 'move' });
  assert.equal((await messageHandler({ type: 'snapshot' })).preferences.actionUsage.move, 2);
  await messageHandler({ type: 'setFontSize', fontSize: 16 });
  assert.equal((await messageHandler({ type: 'snapshot' })).preferences.fontSize, 16);
});
