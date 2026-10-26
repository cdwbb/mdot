import { getVersion } from '@tauri-apps/api/app';
import { isDesktop } from './services/backend';

// Bump this together with package.json / tauri.conf.json / Cargo.toml for the browser preview.
// The desktop build reads its version from the binary itself, so shipped apps always agree
// with the installer they came from.
const FALLBACK_VERSION = '1.0.2';

export let APP_VERSION = FALLBACK_VERSION;

if (isDesktop) {
  getVersion()
    .then((version) => {
      APP_VERSION = version;
    })
    .catch(() => {
      /* keep the fallback */
    });
}
