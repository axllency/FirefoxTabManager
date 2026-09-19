# Advanced Tab Manager

A Firefox 142+ desktop extension for finding and managing tabs across windows. Browsing records and collections stay in extension local storage; private windows are excluded.

## Build and try it

1. Install Node.js 20 or later and run `npm install`.
2. Run `npm run check`, `npm test`, and `npm run lint`.
3. In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/manifest.json`.
4. Click the toolbar button or use Alt+Shift+A. Firefox's **Manage Extension Shortcuts** can change the shortcut. The selector opens in a separate popup window, inset 20% horizontally and 10% vertically from the active normal window. It closes when focus moves outside or when you press Escape. Open the dashboard from the popup.

Click a tab-list column heading to sort by it; click again to reverse the order. Drag a column's right edge to resize it. Column widths are remembered for the popup and dashboard.

Choose a bulk action, select tabs, and press **Go** to run it. **Combine tabs** always creates a new window in the current table order, with the top row placed at the right. Collections and frequent root domains can be pinned or removed from their dropdowns; removed frequent sites can be restored under **Menu → Settings**.

Both the popup and dashboard show **Collections** and **Frequently visited** dropdowns beside the title. The top bar shows the selected city's current weather and today's high and low; use **Menu** to configure Weather or access Undo.

Open dashboards refresh their tab tables when tabs open or close. Closed tabs leave the table; Undo remains available from **Menu**.

Temporary add-ons are removed when Firefox exits. Install a signed package for persistent use.

## Data and limitations

- First-seen time is the extension's observation time for tabs that predate installation.
- Last access is recorded when a loaded tab is selected in the focused browser window. The URL key removes `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, and `igshid` parameters. Other query parameters and fragments remain.
- Closed-tab records, URL usage after the last matching tab closes, and undo entries expire after three days of time with at least one normal, non-private Firefox window open. The timer pauses when no such window is open, including while Firefox is closed. Collections do not expire. Last-access timestamps remain wall-clock times: a tab last used before a week-long Firefox shutdown still displays as last accessed a week ago when the session returns.
- Activity is an activation count, not a CPU or RAM estimate. Firefox does not provide per-tab CPU or RAM through the extension tab API.
- Undo prefers Firefox's session restore. After Firefox restarts, reopening URLs may lose navigation history, form data, containers, and some window placement.
- Weather is off by default. Firefox asks for optional location-data consent when enabled; the entered city or postal code is then sent to Open-Meteo. Network access is limited to the two Open-Meteo API origins.

## Future work

- Add location-based weather with explicit opt-in and permission handling.
