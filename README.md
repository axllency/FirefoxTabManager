# Advanced Tab Manager

A Firefox 142+ desktop extension for finding and managing tabs across windows. Browsing records and collections stay in extension local storage. Private tabs are excluded even when Firefox permits the selector popup to open in a private window.

## Reproduce the build

The checked-in extension source is under `src/` and `static/`. The build uses esbuild to compile and bundle TypeScript, generate source maps, and copy the static extension files into a fresh `dist/` directory. Output is not minified. No HTML or CSS template engine is used.

Prerequisites:

- Node.js 20 or later
- Corepack, which is included with supported Node.js releases

From the repository root, run:

```sh
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm test
pnpm run lint
```

`pnpm run build` deletes any existing `dist/` directory before producing the reviewer-loadable extension. `pnpm test` and `pnpm run lint` also rebuild `dist/`; the final `dist/manifest.json` can be loaded directly in Firefox.

### Current verified build environment

The current `dist/` output was built and verified with:

- Windows 11 23H2, build 22631, x64
- Node.js 24.19.0
- pnpm 11.19.0
- esbuild 0.25.12
- TypeScript 5.9.3
- web-ext 10.6.0

Dependency versions are resolved by `pnpm-lock.yaml`. Node.js 20 remains the minimum supported build version because the generated core test module targets Node.js 20.

## Try it in Firefox

1. Complete the reproducible build steps above.
2. Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/manifest.json`.
3. Click the toolbar button or use Alt+Shift+A. Firefox's **Manage Extension Shortcuts** can change the shortcut. The selector opens in a separate popup window, inset 15% horizontally and 10% vertically from the active Firefox window. It closes when focus moves outside or when you press Escape. Open the dashboard from the popup.

Enabling Firefox's **Let this extension work in Private Windows** setting lets Advanced Tab Manager open its popup in a private window instead of a regular window, which prevents that popup from returning when tabs are restored with Firefox's **Reopen Closed Tab** feature. It also lets you activate the popup from any private window. Private tabs still never appear in Advanced Tab Manager or enter its stored tab data.

Search matches tab titles and URLs as you type. A `window:#` term limits results to a Firefox window ID and can be combined with text, such as `youtube window:12`. The **Is / Not** operator includes or excludes matches. **First seen**, **Last active**, and **All tabs / Loaded tabs / Unloaded tabs** controls provide additional filters; their default **Any age**, **Any time**, and **All tabs** values do not restrict results.

Click a tab-list column heading to sort by it; click again to reverse the order. Non-Title sorts use Last active descending and Title ascending to break ties. Drag a column's right edge to resize it. Column widths are remembered for the popup and dashboard. **Menu** provides controls to reset column widths and choose a saved interface font size.

### Keyboard navigation

- Press **Enter** while the search box is focused to activate the top tab in the currently filtered and sorted results. In the selector popup, this also closes the popup.
- Press **Tab** from the search box to focus the first visible Title cell, then continue pressing **Tab** to move through Title cells in table order.
- Press **Shift+Tab** to move backward through Title cells. From the first Title cell, **Shift+Tab** returns focus to the search box.
- Press **Enter** on a focused Title cell to activate that tab using the same cross-window navigation as clicking its row.

Choose a bulk action, select one or more tabs, and press **Go** to run it; Go is disabled when nothing is selected. Actions are ordered by their locally stored usage frequency and include Close, Unload, Save collection, Save and close, Export URLs, Combine tabs, and Close duplicates. Export downloads one URL per line without closing tabs. **Combine tabs** always creates a new window in the current table order, with the top row placed at the right. Collections and frequent root domains can be pinned or removed from their dropdowns; removed frequent sites can be restored under **Menu → Settings**.

Both the popup and dashboard show **Collections** and **Frequently visited** dropdowns beside the title. The top bar shows the selected city's current weather and today's high and low; use **Menu** to configure Weather or access Undo.

Open dashboards refresh their tab tables when tabs open, close, load, unload, or otherwise update. Closed tabs leave the table; Undo remains available from **Menu**.

Temporary add-ons are removed when Firefox exits. Install a signed package for persistent use.

## Data and limitations

- First-seen time is the extension's observation time for tabs that predate installation.
- Last active is recorded when a loaded tab is selected in the focused browser window. The URL key removes `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, and `igshid` parameters. Other query parameters and fragments remain.
- Closed-tab records, URL usage after the last matching tab closes, and undo entries expire after three days of time with at least one normal, non-private Firefox window open. The timer pauses when no such window is open, including while Firefox is closed. Collections do not expire. Last-access timestamps remain wall-clock times: a tab last used before a week-long Firefox shutdown still displays as last accessed a week ago when the session returns.
- Firefox does not provide per-tab CPU or RAM through the WebExtension tabs API, so the table does not display those measurements.
- Undo prefers Firefox's session restore. After Firefox restarts, reopening URLs may lose navigation history, form data, containers, and some window placement.
- Weather is off by default. Firefox asks for optional location-data consent when enabled; the entered city or postal code is then sent to Open-Meteo. Network access is limited to the two Open-Meteo API origins.

## Future work

- Add automatic device-location weather with explicit opt-in. Manual city or postal-code weather is already available.
