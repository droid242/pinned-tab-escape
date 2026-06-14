# Pinned Tab Escape & Protection (v2.0.0)

This is a small but extremely useful Chrome / Edge / Brave / etc. extension that protects and manages your pinned tabs.

## What does it do?

The extension performs three key functions:

### 1. Pinned tab focus protection when closing tabs
If you close the **last** unpinned tab, the extension automatically opens a new, empty tab as a buffer. This prevents any pinned tab from becoming active.

### 2. Restoring pinned tabs on startup *(with two-step verification)*
The extension saves the URLs and order of your pinned tabs in the background *(using `chrome.storage.local`)* in an event-driven manner *(whenever you pin, unpin, navigate, or reorder a tab)*. 
* If the browser fails to restore your pinned tabs on startup due to an error, the extension will automatically do so **1.5 seconds** after startup, and perform a secondary check at **4.0 seconds** to avoid duplication.
* **Warning**: If you manually close or unpin a pinned tab during your session, the extension will remember this and will not restore it on the next startup.

### 3. Diverting navigation away from pinned tabs *(protection against overwriting)*
If you are on a pinned tab, the extension prevents its content from being replaced by external navigation:
* **External links**: If you click on a link pointing to an external website within the pinned tab *(e.g., Mastodon)*, it will automatically open in a new tab, leaving your pinned page untouched.
* **Address bar and bookmarks**: If you enter a new URL in the address bar or click on a bookmark while on a pinned tab, the extension diverts the navigation: the new page opens in a new tab, and the pinned tab reverts to its original URL.
* **Allowed**: Navigation within the pinned tab under the same domain works freely *(e.g., switching between messages on Messenger)*.

---

## Installation on Chrome / Edge / Brave / etc.

### 1. Chrome Web Store
The extension is available in the Chrome Web Store:  
[https://chromewebstore.google.com/detail/pinned-tab-escape/bghiomkekbcjojbpokmbckfejaojchcb](https://chromewebstore.google.com/detail/pinned-tab-escape/bghiomkekbcjojbpokmbckfejaojchcb)

### 2. Developer mode (manual installation)
1. Download / copy the extension files to a permanent folder on your computer.
2. Open the browser's extensions page:
   * Chrome/Perplexity Comet: `chrome://extensions`
   * Edge: `edge://extensions`
   * Brave: `brave://extensions`
   * Opera: `opera://extensions`
   * Vivaldi: `vivaldi://extensions`
3. Enable the **Developer mode** toggle in the top-right (or left-side) corner.
4. Click the **Load unpacked** button.
5. Select the folder that contains the `manifest.json` file.
