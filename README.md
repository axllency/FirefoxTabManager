# Advanced Tab Manager

Advanced Tab Manager is a Manifest V3 extension for Chromium 127 and newer. It provides a compact toolbar popup and a larger dashboard for finding and managing tabs across normal browser windows. It is intended for Google Chrome, Microsoft Edge, and Chromium browsers that support the APIs declared in the manifest.

> [!CAUTION]
> This project was originally written as a Firefox extension and converted to Chromium with minimal effort. The main Firefox-specific APIs and manifest fields have been replaced, but browser-specific bugs may remain. Back up important tabs before using bulk Close, Combine tabs, or Undo operations.

Incognito tabs are excluded from search results, actions, exports, collections, and stored browsing data. Tab records and preferences are stored locally in the extension.

## Current features

### Search, filter, and sort

- Search open tab titles and URLs across all normal Chromium windows as you type.
- Use `window:#` to restrict results to a Chromium window ID, such as `youtube window:12`.
- Use **Is** to include matches or **Not** to exclude them.
- Filter by tab **Age** using older/younger than 1, 3, 7, or 30 days.
- Filter by **Last active** using within/before 1, 3, 7, or 30 days.
- Filter the table to all, loaded, or unloaded tabs.
- Sort by clicking a column heading; click it again to reverse the direction.
- For non-Title sorts, ties use Last active descending and then Title ascending.
- Resize table columns by dragging their dividers. Saved widths can be reset under **Menu**.

Age represents when the extension first observed the tab. Tabs younger than one day display hours; older tabs display days. Last active uses Chrome's `lastAccessed` value to initialize a URL record and is subsequently updated when a loaded tab is active in a focused normal window.

### Tab actions

Select tabs with their checkboxes, choose an action, and press **Go**. Go remains disabled when no tabs are selected. Actions are reordered according to their locally recorded usage frequency.

Available actions include:

- Close selected tabs.
- Unload selected tabs with Chrome's tab discard API.
- Save selected tabs as a collection.
- Save a collection and close its tabs.
- Export selected HTTP(S) URLs to a text file without closing them.
- Combine selected tabs into a new window using the current table order. The top result becomes the rightmost tab.
- Close exact-URL duplicates while preferring the focused active copy and then the most recently active copy.

Clicking a tab title activates that tab and focuses its browser window. Row menus provide common actions for individual tabs.

### Collections and frequently visited sites

- Collections are independent URL snapshots stored in `chrome.storage.local`.
- Open one collection URL, open a collection in the current window, or open it in a new window.
- Import a plain-text file containing one HTTP(S) URL per line.
- Pin or delete collections from the Collections dropdown.
- Frequently visited entries are reduced to root domains and use Chrome's favicon service.
- Pin or hide frequently visited entries. Hidden entries can be restored under **Menu → Settings**.

### Dashboard and display settings

- Open the full dashboard by clicking the extension title or choosing **Dashboard** from the popup menu.
- Open dashboards update when tabs are created, closed, or updated.
- Font size and column-width controls are available under **Menu**.

### Undo and retention

- Bulk close and tab-move operations create Undo entries.
- Closed-tab records, URL activity records for URLs no longer open, and Undo entries expire after three days of eligible browser runtime.
- The three-day timer advances only while at least one normal, non-incognito Chromium window is open. Closing the browser pauses this retention timer.
- Last-active values remain wall-clock timestamps. A tab last used before Chrome was closed for a week will display as last active a week ago when Chrome reopens.
- Collections do not expire.

## Keyboard use

The default extension shortcut is **Alt+Shift+A**.

- **Enter** in the search field activates the first filtered and sorted result.
- **Tab** from the search field moves directly to the first visible Title cell.
- Continue pressing **Tab** to move through Title cells.
- **Shift+Tab** moves backward; from the first Title cell it returns to the search field.
- **Enter** on a focused Title cell activates that tab and focuses its window.
- **Escape** closes the toolbar popup.

### Change the extension shortcut

Chrome does not allow an extension to overwrite a shortcut that the user or another extension already owns. If **Alt+Shift+A** is unavailable, Chrome may leave the command unassigned.

In Google Chrome:

1. Open `chrome://extensions/shortcuts`.
2. Find **Advanced Tab Manager**.
3. Click the shortcut field beside **Open Advanced Tab Manager**.
4. Press the desired key combination.
5. If Chrome shows a scope selector, choose **In Chrome** or **Global** as preferred. Global availability depends on the browser and operating system.

In Microsoft Edge, follow the same steps at `edge://extensions/shortcuts`. Other Chromium browsers generally provide the equivalent page at their browser-specific `://extensions/shortcuts` address.

After reloading or updating an unpacked extension, revisit the shortcuts page if the hotkey stops working. Chromium preserves user shortcut settings and does not always reapply a changed manifest default.

## Build and install

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Run `npm run check`, `npm test`, and `npm run lint`.
4. Open `chrome://extensions` or `edge://extensions`.
5. Enable **Developer mode**.
6. Choose **Load unpacked** and select the generated `dist` directory.
7. Pin Advanced Tab Manager if you want its toolbar button to remain visible.

After changing the source, rebuild with `npm run build`, then press **Reload** on the extension's card.

An unpacked extension remains installed until removed, but it becomes unavailable if its source directory is moved or deleted. Normal distribution requires Chrome Web Store, Microsoft Edge Add-ons, or enterprise packaging.

## Data and limitations

- Tab titles and URLs are sanitized when retrieved from Chrome.
- Last-active URL keys remove `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, and `igshid`. Other query parameters and fragments remain.
- Duplicate tabs share URL-level Last active data after those tracking parameters are removed.
- Chromium does not expose per-tab CPU or RAM through the Tabs API, so those measurements are not displayed.
- Undo prefers Chromium's Sessions API. After restart, fallback URL reopening may lose navigation history, form data, tab groups, and exact window placement.
- Chromium does not persist extension-defined values directly on tabs. The extension uses session and local storage plus exact-URL matching to reconnect records.
- Unloading can fail for an active, already unloaded, or otherwise non-discardable tab.
