import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) throw Error('Manifest V3 is required.');
if (manifest.background?.service_worker !== 'background.js') throw Error('Chromium MV3 requires background.service_worker.');
if (manifest.action?.default_popup !== 'popup.html') throw Error('The toolbar action must use the standard Chromium extension popup.');
if (Number(manifest.minimum_chrome_version) < 127) throw Error('Chrome 127+ is required for action.openPopup().');
if (manifest.commands?.['open-tab-manager']?.suggested_key?.default !== 'Alt+Shift+A') throw Error('The popup command must default to Alt+Shift+A.');
if (manifest.background?.scripts || manifest.browser_specific_settings) throw Error('Firefox-only manifest fields are present.');
for (const permission of ['tabs', 'storage', 'sessions', 'downloads', 'topSites', 'favicon']) {
  if (!manifest.permissions?.includes(permission)) throw Error(`Missing permission: ${permission}`);
}
console.log('Chromium manifest validation passed.');
