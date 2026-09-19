# Privacy Policy for Advanced Tab Manager

**Effective date:** September 19, 2026

Advanced Tab Manager is a Firefox 142+ browser extension for searching, organizing, saving, unloading, moving, closing, exporting, and restoring tabs. This policy describes the information used by the Firefox implementation currently contained in this project.

## Summary

Advanced Tab Manager processes browsing information to provide its tab-management features. Most information remains in the user's local Firefox profile. The extension does not include advertising or analytics and does not sell browsing information.

Weather is optional. When the user enables weather and searches for a location, the extension sends the entered city or postal code and selected coordinates to Open-Meteo as described below.

## Information the extension processes

For normal, non-private Firefox tabs, the extension may process:

- Tab titles, URLs, and favicons.
- Firefox window IDs, tab positions, and container identifiers.
- Tab states such as active, pinned, audible, muted, loaded, or discarded.
- The time the extension first observed a tab, displayed as **Age**.
- The last time a tracked URL was active in a loaded tab within the focused Firefox window.
- Extension-generated record IDs used to reconnect tabs restored through Firefox Sessions.
- Recently closed tab metadata and snapshots used by Undo.
- Collections created or imported by the user, including names, tab titles, and URLs.
- Locally counted action usage used to order the Actions menu.
- Preferences including font size, column widths, pinned frequently visited sites, and hidden frequently visited sites.
- Firefox's frequently visited site list while the popup or dashboard is open.

When weather is enabled, the extension may also process and store:

- A city name or postal code entered by the user.
- Location candidates returned by Open-Meteo.
- The selected location name, latitude, and longitude.
- Current temperature, daily high and low temperatures, and a weather condition code returned by Open-Meteo while the interface is open.

Tab titles, URLs, collection names, and saved weather location names are sanitized before storage or display. For URL-level Last active records, the extension removes common tracking parameters including `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, and `igshid`. Other URL components may remain.

## How information is used

The extension uses this information to:

- Search, filter, and sort tabs across Firefox windows.
- Focus a selected tab and its window.
- Unload, move, close, and deduplicate selected tabs.
- Create, display, import, export, and open URL collections.
- Restore recent extension actions.
- Display frequently visited root domains.
- Preserve tab records and preferences across Firefox sessions.
- Display optional weather for a user-selected location.

## Local storage

Advanced Tab Manager uses:

- `browser.storage.local` for persistent URL activity, collections, Undo entries, weather settings, and preferences.
- `browser.storage.session` for temporary popup and retention-clock state during the current Firefox session.
- Firefox session tab values through `browser.sessions.setTabValue` and `browser.sessions.getTabValue` to reconnect restored tabs with their extension records.
- Page `localStorage` for saved table column widths.

The extension does not use `browser.storage.sync`. It does not intentionally synchronize stored records to other devices.

## Retention

- Closed-tab records expire after three days of eligible Firefox runtime.
- Undo entries expire after the same three-day period.
- URL activity records expire three days after the last matching tab closes.
- The retention timer advances only while at least one normal, non-private Firefox window is open. It pauses while Firefox is closed or while no eligible window is open.
- Collections, weather settings, and user preferences remain until deleted or changed by the user, Firefox clears extension storage, or the extension is uninstalled.
- Open-tab session values may remain available when Firefox restores a tab, subject to Firefox's Sessions behavior.

Last-active values are wall-clock timestamps. Time with Firefox closed does not consume the three-day retention period, but it remains visible in descriptions such as “last active 7 days ago.”

## Private browsing

Private tabs are excluded from search results, management actions, exports, collections, frequently visited results, and persistent tab records.

If the user enables Firefox's **Let this extension work in Private Windows** option, the extension may open its selector popup as a private popup and may temporarily process the source private window's dimensions and window ID to position that popup. It still excludes private tab titles, URLs, and other private browsing records from its tab-management data.

The manifest uses Firefox's `spanning` private-browsing mode.

## Data sent to third parties

Advanced Tab Manager does not send browsing records to the developer and does not use analytics, advertising, or profiling services.

When weather is enabled:

- A location search sends the city name or postal code entered by the user to `geocoding-api.open-meteo.com`.
- After the user selects a result, the selected latitude and longitude are sent to `api.open-meteo.com` to retrieve current conditions and the daily high and low.
- Open-Meteo receives ordinary connection information, such as the user's IP address, and handles requests according to its own privacy practices.

The extension requests Firefox's optional `locationInfo` data-collection consent before using weather. Disabling weather removes that optional consent through Firefox's permissions API. The extension does not request device geolocation.

Other user-directed or browser-provided operations include:

- Opening a tab or collection URL, which causes Firefox to connect to that website normally.
- Displaying a favicon supplied by Firefox or referenced by a tab. A remote favicon URL may cause Firefox to request that image from its host using a no-referrer policy.
- Exporting selected URLs to a user-selected text file through Firefox's Downloads API.
- Importing a text file selected by the user and reading it within the extension.

Websites and Open-Meteo are governed by their own privacy policies.

## Firefox permissions

The extension requests:

- **tabs:** Read tab titles, URLs, favicons, state, container association, and window placement, and perform requested tab-management actions.
- **storage:** Store local records, collections, Undo history, weather settings, and preferences.
- **sessions:** Associate extension records with tabs and assist with restoring recently closed tabs.
- **downloads:** Export selected URLs to a text file.
- **topSites:** Display frequently visited root domains.

The extension also declares host access to:

- `https://geocoding-api.open-meteo.com/*`
- `https://api.open-meteo.com/*`

Firefox-specific manifest declarations include:

- Required data collection: **none**.
- Optional data collection: **locationInfo**, requested only when weather is enabled.
- Private browsing mode: **spanning**.

The extension does not inject content scripts into webpages.

## User controls

Users can:

- Keep weather disabled, revoke its optional location-data consent, or change the saved location.
- Delete individual collections.
- Hide or restore frequently visited entries.
- Let temporary closed-tab and Undo records expire.
- Export and edit URL files using normal filesystem tools.
- Clear extension data through Firefox's extension or site-data controls.
- Remove stored extension data by uninstalling Advanced Tab Manager.
- Disable **Let this extension work in Private Windows** from Firefox's extension settings.

Closing or deleting a tab does not necessarily remove information retained independently by Firefox, including browser history and Firefox's own recently closed sessions.

## Security

Browsing-related information is stored in the user's Firefox profile and is protected by Firefox and operating-system access controls. No storage method can be guaranteed completely secure. Anyone with access to the same Firefox profile or operating-system account may be able to access extension data.

## Changes to this policy

This policy may be updated when the extension's features, permissions, or data practices change. Material changes should be reflected in this document with an updated effective date.

## Contact

Questions about this policy should be directed to the project maintainer through the repository or extension distribution page from which Advanced Tab Manager was obtained.
