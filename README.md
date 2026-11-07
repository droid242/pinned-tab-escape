# Pinned Tab Escape & Protection (v2.1.0)

This is a lightweight and powerful Chrome / Edge / Brave / Chromium extension that protects and manages your **pinned tabs** and **tab groups**, fully supporting multi-window setups and **Microsoft Edge Workspaces**.

---

## What does it do?

### 1. Pinned Tab Focus Protection (Tab Escape)
If you close the **last** unpinned tab in a window, the extension automatically opens a new empty tab as a buffer. This prevents any pinned tab from inadvertently becoming active and receiving accidental keypresses or closes. *(Note: Grouped tabs do not trigger a buffer tab; focus flows naturally to neighboring tabs).*

### 2. Navigation Protection for Pinned Tabs & Tab Groups
When working in a pinned tab or a **tab group**, the extension protects its contents from being replaced:
* **External links**: Clicking a link pointing to an external domain automatically opens in a new tab **outside** the group or pinned state, keeping your original tab intact.
* **Links opening new tabs (`target="_blank"`, `window.open`)**: Even on the same domain, any link or script configured to open in a new tab will be placed **outside** the tab group rather than cluttering it.
* **Address bar and bookmarks**: Entering a new URL or opening a bookmark while on a protected tab diverts the navigation to a new tab outside the group, reverting the protected tab to its in-domain URL.
* **Same-domain navigation allowed**: You can freely browse within the same domain (e.g., clicking articles on a news portal or switching chat threads).

### 3. Base URL Tracking & Automatic Restoration (Startup & Edge Workspaces)
* **Base URL concept**: When you pin a tab or add a tab to a tab group, its current URL is captured as its **Base URL** (e.g., `example.com/X`).
* **Session freedom**: During your browsing session, you can navigate deeper into the site (e.g., to `example.com/Y`).
* **Startup & Workspace restore**: When you restart the browser, or open a Microsoft Edge Workspace window later in the day, the extension automatically ensures your pinned and grouped tabs restore to their clean **Base URL** (`example.com/X`), rather than staying stuck on deep subpages.
* **New tabs in groups**: Opening a new, empty tab in a group will not lock until you navigate to your first web page; that first loaded page becomes the tab's new Base URL.
* **Changing a tab's Base URL**: Simply drag the tab out of the group, navigate to the new URL, and drag it back in.

---

## Installation on Chrome / Edge / Brave / Opera / Vivaldi

### 1. Chrome Web Store
The extension is available in the Chrome Web Store:  
[https://chromewebstore.google.com/detail/pinned-tab-escape/bghiomkekbcjojbpokmbckfejaojchcb](https://chromewebstore.google.com/detail/pinned-tab-escape/bghiomkekbcjojbpokmbckfejaojchcb)

### 2. Developer mode (manual installation)
1. Download / copy the extension files to a permanent folder on your computer.
2. Open the browser's extensions page:
   * Edge: `edge://extensions`
   * Chrome/Perplexity Comet: `chrome://extensions`
   * Brave: `brave://extensions`
   * Opera: `opera://extensions`
   * Vivaldi: `vivaldi://extensions`
3. Enable the **Developer mode** toggle.
4. Click the **Load unpacked** button.
5. Select the folder that contains the `manifest.json` file.
