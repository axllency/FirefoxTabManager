# Advanced Tab Manager

A Chromium 120+ desktop extension for finding and managing tabs across windows. It is designed for Google Chrome, Microsoft Edge, and other Chromium browsers that support the required Manifest V3 APIs. Browsing records and collections stay in extension local storage. Incognito tabs are excluded even when the browser permits the selector popup to open in an incognito window.

## Build and try it

1. Install Node.js 20 or later and run `npm install`.
2. Run `npm run check`, `npm test`, and `npm run lint`.
3. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge, enable **Developer mode**, choose **Load unpacked**, and select the `dist` directory.
4. Click the toolbar button or use Alt+Shift+A. The browser's extension shortcut page can change the shortcut (`chrome://extensions/shortcuts` or `edge://extensions/shortcuts`). The selector opens in a separate popup window, inset 15% horizontally and 10% vertically from the active browser window. It closes when focus moves outside or when you press Escape. Open the dashboard from the popup.

Enabling the extension's **Allow in Incognito** setting lets Advanced Tab Manager open its selector in an incognito window instead of a regular window. This prevents the selector from being included with restored regular-window tabs and lets you activate it from an incognito window. Incognito tabs still never appear in Advanced Tab Manager or enter its stored tab data. Without this permission, the selector opens as a normal non-incognito popup.

Search matches tab titles and URLs as you type. A `window:#` term limits results to a Chromium window ID and can be combined with text, such as `youtube window:12`. The **Is / Not** operator includes or excludes matches. **First seen**, **Last active**, and **All tabs / Loaded tabs / Unloaded tabs** controls provide additional filters; their default **Any age**, **Any time**, and **All tabs** values do not restrict results.

Click a tab-list column heading to sort by it; click again to reverse the order. Non-Title sorts use Last active descending and Title ascending to break ties. Drag a column's right edge to resize it. Column widths are remembered for the popup and dashboard. **Menu** provides controls to reset column widths and choose a saved interface font size.

### Keyboard navigation

- Press **Enter** while the search box is focused to activate the top tab in the currently filtered and sorted results. In the selector popup, this also closes the popup.
- Press **Tab** from the search box to focus the first visible Title cell, then continue pressing **Tab** to move through Title cells in table order.
- Press **Shift+Tab** to move backward through Title cells. From the first Title cell, **Shift+Tab** returns focus to the search box.
- Press **Enter** on a focused Title cell to activate that tab using the same cross-window navigation as clicking its row.

Choose a bulk action, select one or more tabs, and press **Go** to run it; Go is disabled when nothing is selected. Actions are ordered by their locally stored usage frequency and include Close, Unload, Save collection, Save and close, Export URLs, Combine tabs, and Close duplicates. Export downloads one URL per line without closing tabs. **Combine tabs** always creates a new window in the current table order, with the top row placed at the right. Collections and frequent root domains can be pinned or removed from their dropdowns; removed frequent sites can be restored under **Menu → Settings**.

Both the popup and dashboard show **Collections** and **Frequently visited** dropdowns beside the title. The top bar shows the selected city's current weather and today's high and low; use **Menu** to configure Weather or access Undo.

Open dashboards refresh their tab tables when tabs open, close, load, unload, or otherwise update. Closed tabs leave the table; Undo remains available from **Menu**.

An unpacked extension remains installed until it is removed, but Chromium disables it if its source directory becomes unavailable. Chrome Web Store or enterprise packaging is needed for normal distribution.

## Data and limitations

- First-seen time is the extension's observation time for tabs that predate installation.
- Last active is recorded when a loaded tab is selected in the focused browser window. The URL key removes `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, and `igshid` parameters. Other query parameters and fragments remain.
- Closed-tab records, URL usage after the last matching tab closes, and undo entries expire after three days of time with at least one normal, non-incognito Chromium window open. The timer pauses when no such window is open, including while the browser is closed. Collections do not expire. Last-active timestamps remain wall-clock times: a tab last used before a week-long browser shutdown still displays as last active a week ago when the session returns.
- Chromium does not provide per-tab CPU or RAM through the extensions tabs API, so the table does not display those measurements.
- Undo prefers Chromium's sessions restore API. After a browser restart, reopening URLs may lose navigation history, form data, tab groups, and some window placement. Chromium does not expose Firefox-style per-tab session values, so native reopen recognition uses persisted records and an exact-URL match within the three-day retention window.
- Weather is off by default. Enabling it and searching for a city or postal code sends the entered location to Open-Meteo. Network access is limited to the two Open-Meteo API origins declared in the manifest.

## Future work

- Add automatic device-location weather with explicit opt-in. Manual city or postal-code weather is already available.
