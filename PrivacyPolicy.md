# Privacy Policy for Advanced Tab Manager

**Effective date:** September 19, 2026

Advanced Tab Manager is a Chromium browser extension that helps users search, organize, save, unload, move, close, export, and restore browser tabs. This policy explains what information the extension uses and how that information is handled.

## Summary

Advanced Tab Manager processes browser tab information to provide its features. The extension stores this information locally in the user's Chromium browser profile. It does not send browsing information to the developer or to external services, does not include analytics or advertising, and does not sell or share user data.

## Information the extension processes

The extension may process the following information for normal, non-incognito browser tabs:

- Tab titles and URLs.
- Favicons supplied by Chrome or referenced by a tab.
- Chromium window IDs and tab positions.
- Tab states such as active, pinned, audible, muted, loaded, or discarded.
- The time the extension first observed a tab, displayed as **Age**.
- The time a URL was last active. Chrome's native `lastAccessed` value may initialize this record; later activity is recorded when a loaded tab is active in a focused normal window.
- Extension-generated tab record identifiers used to reconnect restored tabs with existing records.
- Recently closed tab metadata and snapshots used by Undo.
- Collections created or imported by the user, including collection names, tab titles, and URLs.
- Action usage counts used only to order the Actions menu.
- User preferences, including font size, saved column widths, pinned frequently visited sites, and hidden frequently visited sites.
- Chrome's frequently visited site list while the popup or dashboard is open.

Tab titles and URLs are sanitized when retrieved from Chrome. For URL-level Last active records, the extension removes common tracking parameters including `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`, and `igshid`. Other URL components may remain.

## How information is used

The extension uses this information only to provide user-requested functionality, including:

- Searching, filtering, and sorting open tabs.
- Focusing tabs across browser windows.
- Unloading, moving, closing, and deduplicating selected tabs.
- Creating, displaying, importing, and opening collections.
- Exporting selected URLs to a text file.
- Restoring recent extension actions.
- Displaying frequently visited root domains.
- Preserving extension preferences and tab history across browser sessions.

## Storage

Advanced Tab Manager uses:

- `chrome.storage.local` for persistent tab records, URL activity, collections, Undo entries, and preferences.
- `chrome.storage.session` for temporary identifiers and state associated with the current browser session.
- Page `localStorage` for saved table column widths.

The extension does not use `chrome.storage.sync`. Stored information is not intentionally synchronized to the user's other devices by the extension.

## Retention

- Records for closed tabs expire after three days of eligible browser runtime.
- Undo entries expire after the same three-day period.
- URL activity records expire three days after the last matching tab closes.
- The retention timer advances only while at least one normal, non-incognito Chromium window is open. It pauses while the browser is closed or while no eligible window is open.
- Collections and user preferences remain until the user deletes or changes them, clears the extension's storage, or uninstalls the extension.
- Open-tab records remain while needed to track currently open or restored tabs.

Last-active values are wall-clock timestamps. Time spent with the browser closed does not consume the three-day retention period, but it is reflected in displays such as “last active 7 days ago.”

## Incognito browsing

Incognito tabs are excluded from the extension's search results, actions, exports, collections, frequently visited display, and persistent tab records. The extension does not intentionally store information about incognito tabs.

## Data transmission and third parties

Advanced Tab Manager does not transmit browsing information to the developer or to external analytics, advertising, or data-processing services. The current manifest declares no remote host permissions and contains no general-purpose runtime network requests.

The following user-directed or browser-provided operations are not transmissions by the extension to the developer:

- Opening a tab or collection URL causes Chromium to connect to the destination website normally.
- Displaying a favicon may use Chrome's internal favicon service or a favicon URL supplied by Chrome. If Chrome supplies a remote HTTP(S) favicon URL, displaying it can cause the browser to request that image from its host. The request uses a no-referrer policy, but the favicon host may still receive ordinary connection information such as the user's IP address.
- Exporting URLs writes a user-requested text file through Chromium's Downloads API.
- Importing a URL list reads the file selected by the user inside the extension.

Websites opened by the user are governed by their own privacy policies.

## Permissions

The extension requests these Chromium permissions:

- **tabs:** Read tab titles, URLs, favicons, state, and window placement, and perform requested tab-management actions.
- **storage:** Save local records, collections, Undo history, and preferences.
- **sessions:** Assist with restoring recently closed tabs.
- **downloads:** Export selected URLs to a text file.
- **topSites:** Display frequently visited root domains.
- **favicon:** Display favicons through Chromium's internal favicon service.

The extension does not inject content scripts into webpages.

## User controls

Users can:

- Delete individual collections.
- Hide or restore frequently visited entries.
- Let temporary closed-tab and Undo records expire.
- Clear the extension's stored data through Chromium's extension or site-data controls.
- Remove all extension data by uninstalling Advanced Tab Manager.
- Review or edit an exported URL file using normal filesystem tools.

Closing or deleting a tab does not necessarily delete information retained independently by Chromium, such as browser history or Chromium's own recently closed sessions.

## Security

The extension stores browsing-related information in the user's local Chromium profile and relies on Chromium's extension security and storage controls. No storage mechanism can be guaranteed to be completely secure. Users who share a browser profile or operating-system account should consider that other people with access to that profile may be able to access extension data.

## Changes to this policy

This policy may be updated when the extension's features, permissions, or data practices change. Material changes should be reflected in this document and accompanied by an updated effective date.

## Contact

Questions about this policy should be directed to the project maintainer through the repository or extension distribution page from which Advanced Tab Manager was obtained.
