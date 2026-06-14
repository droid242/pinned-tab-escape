// Pinned Tab Escape / Protection
// Chrome/Edge/Brave MV3 extension
//
// Goals:
// 1. Pinned tab protection when closing tabs (redirect focus to a regular or new tab if it would fall on a pinned tab).
// 2. Restore pinned tabs on startup with a two-step verification (1.5s and 4s).
// 3. Divert navigation from pinned tabs (address bar, bookmarks, and external links open in a new tab).

const tabState = new Map();       // tabId -> { windowId, pinned, url, lockedUrl }
const normalHistory = new Map();  // windowId -> [tabId, tabId, ...]

// Save the state of pinned tabs to storage
async function savePinnedTabsState() {
  try {
    const tabs = await chrome.tabs.query({ pinned: true });
    const pinnedData = tabs.map(t => ({
      url: t.url,
      index: t.index
    }));
    await chrome.storage.local.set({ savedPinnedTabs: pinnedData });
    console.log("Pinned tabs saved:", pinnedData);
  } catch (e) {
    console.error("Error saving pinned tabs:", e);
  }
}

function rememberTab(tab) {
  if (!tab || typeof tab.id !== "number") return;
  const existing = tabState.get(tab.id);
  
  let lockedUrl = existing?.lockedUrl || null;
  if (tab.pinned) {
    if (!existing?.pinned || !lockedUrl) {
      lockedUrl = tab.url;
    } else if (tab.url) {
      try {
        const oldHost = new URL(lockedUrl).hostname;
        const newHost = new URL(tab.url).hostname;
        if (oldHost === newHost) {
          lockedUrl = tab.url; // Update the locked URL during navigation within the same domain
        }
      } catch {
        // Keep the old URL in case of an error
      }
    }
  } else {
    lockedUrl = null;
  }

  tabState.set(tab.id, {
    windowId: tab.windowId,
    pinned: Boolean(tab.pinned),
    url: tab.url,
    lockedUrl: lockedUrl
  });

  // Sync the pinned state with the content script
  chrome.tabs.sendMessage(tab.id, { action: "setPinned", pinned: Boolean(tab.pinned) }).catch(() => {
    // Suppress errors in case the content script hasn't loaded on the tab yet
  });
}

function removeFromHistory(windowId, tabId) {
  const history = normalHistory.get(windowId) || [];
  normalHistory.set(
    windowId,
    history.filter(id => id !== tabId)
  );
}

function touchNormalTab(tab) {
  if (!tab || typeof tab.id !== "number" || tab.pinned) return;

  const windowId = tab.windowId;
  const history = normalHistory.get(windowId) || [];
  const filtered = history.filter(id => id !== tab.id);

  filtered.unshift(tab.id);

  // Avoid growing infinitely.
  normalHistory.set(windowId, filtered.slice(0, 50));
}

async function getTabSafe(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function activateBestNormalTab(windowId) {
  const history = normalHistory.get(windowId) || [];

  // 1) First, try the most recently used regular tab.
  for (const tabId of history) {
    const tab = await getTabSafe(tabId);
    if (tab && !tab.pinned && tab.windowId === windowId) {
      await chrome.tabs.update(tab.id, { active: true });
      return true;
    }
  }

  // 2) Look for any unpinned tab.
  const normalTabs = await chrome.tabs.query({ windowId, pinned: false });
  const usableTabs = normalTabs.filter(tab => !tab.discarded || typeof tab.discarded === "boolean");

  if (usableTabs.length > 0) {
    usableTabs.sort((a, b) => a.index - b.index);
    await chrome.tabs.update(usableTabs[0].id, { active: true });
    return true;
  }

  // 3) If there are no regular tabs, open a new empty tab.
  await chrome.tabs.create({
    windowId,
    url: "chrome://newtab/",
    active: true,
    pinned: false
  });

  return true;
}

// Smart URL comparison to avoid duplicates
function isSimilarUrl(url1, url2) {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.protocol === u2.protocol && 
           u1.hostname === u2.hostname && 
           u1.pathname === u2.pathname;
  } catch {
    return url1 === url2;
  }
}

// Restore logic on startup
async function restorePinnedTabsIfNeeded() {
  const data = await chrome.storage.local.get("savedPinnedTabs");
  const saved = data.savedPinnedTabs || [];
  if (saved.length === 0) return;

  const currentPinned = await chrome.tabs.query({ pinned: true });
  
  const windows = await chrome.windows.getAll({ populate: false });
  if (windows.length === 0) return;
  const targetWindowId = windows[0].id;

  for (const savedTab of saved) {
    const isAlreadyOpen = currentPinned.some(t => isSimilarUrl(t.url, savedTab.url));
    if (!isAlreadyOpen) {
      try {
        await chrome.tabs.create({
          windowId: targetWindowId,
          url: savedTab.url,
          pinned: true,
          active: false,
          index: savedTab.index
        });
        console.log("Successfully restored pinned tab:", savedTab.url);
      } catch (e) {
        console.error("Failed to restore pinned tab:", savedTab.url, e);
      }
    }
  }
}

async function initializeState() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    rememberTab(tab);
    if (tab.active && !tab.pinned) {
      touchNormalTab(tab);
    }
  }
}

// Populate the state and save it on startup.
chrome.runtime.onInstalled.addListener(async () => {
  await initializeState();
  await savePinnedTabsState();
});

// Two-step restoration on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log("Browser startup detected, initializing state and running two-step restoration.");
  await initializeState();

  setTimeout(async () => {
    console.log("Step 1 restoration check...");
    await restorePinnedTabsIfNeeded();
  }, 1500);

  setTimeout(async () => {
    console.log("Step 2 restoration check...");
    await restorePinnedTabsIfNeeded();
  }, 4000);
});

// Remember the tab when created or updated.
chrome.tabs.onCreated.addListener(tab => {
  rememberTab(tab);
  if (tab.active && !tab.pinned) {
    touchNormalTab(tab);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  rememberTab(tab);

  if (typeof changeInfo.pinned === "boolean") {
    if (changeInfo.pinned) {
      removeFromHistory(tab.windowId, tabId);
    } else if (tab.active) {
      touchNormalTab(tab);
    }
    await savePinnedTabsState();
  } else if (tab.pinned && changeInfo.url) {
    await savePinnedTabsState();
  }
});

chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  const tab = await getTabSafe(tabId);
  if (tab && tab.pinned) {
    await savePinnedTabsState();
  }
});

// When a tab is activated.
chrome.tabs.onActivated.addListener(async activeInfo => {
  const tab = await getTabSafe(activeInfo.tabId);
  if (!tab) return;

  rememberTab(tab);

  if (tab.pinned) {
    removeFromHistory(activeInfo.windowId, activeInfo.tabId);
  } else {
    touchNormalTab(tab);
  }
});

// Check the state when a tab is closed.
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const old = tabState.get(tabId);
  const windowId = removeInfo.windowId ?? old?.windowId;

  if (old?.windowId !== undefined) {
    removeFromHistory(old.windowId, tabId);
  }

  tabState.delete(tabId);

  if (old?.pinned) {
    await savePinnedTabsState();
    return;
  }

  // The closed tab was a regular tab. Give Chrome time to switch focus.
  setTimeout(async () => {
    try {
      const [activeTab] = await chrome.tabs.query({ windowId, active: true });
      if (activeTab && activeTab.pinned) {
        await activateBestNormalTab(windowId);
      }
    } catch (err) {
      console.error("Error correcting focus:", err);
    }
  }, 50);

  await savePinnedTabsState();
});

// Helper function to open a URL: reuse an empty tab if available, otherwise create a new one
async function openUrlInNormalTab(windowId, url) {
  try {
    const queryInfo = { pinned: false };
    if (typeof windowId === "number") {
      queryInfo.windowId = windowId;
    }
    const normalTabs = await chrome.tabs.query(queryInfo);
    const emptyTab = normalTabs.find(tab => {
      const tabUrl = tab.url || tab.pendingUrl || "";
      return tabUrl === "chrome://newtab/" || 
             tabUrl === "edge://newtab/" || 
             tabUrl === "about:blank" || 
             tabUrl === "about:newtab" || 
             tabUrl === "";
    });

    if (emptyTab) {
      await chrome.tabs.update(emptyTab.id, { url: url, active: true });
      console.log(`Reused empty tab (${emptyTab.id}) for: ${url}`);
    } else {
      const createInfo = { url: url, active: true };
      if (typeof windowId === "number") {
        createInfo.windowId = windowId;
      }
      await chrome.tabs.create(createInfo);
      console.log(`New tab created for: ${url}`);
    }
  } catch (err) {
    console.error("Error opening/updating tab:", err);
  }
}

// Divert external navigations initiated from the address bar or bookmarks on pinned tabs
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only monitor main frame navigation

  const tabId = details.tabId;
  const state = tabState.get(tabId);
  if (!state || !state.pinned || !state.lockedUrl) return;

  // Exceptions: internal browser pages and extension pages
  if (details.url.startsWith("chrome://") || details.url.startsWith("chrome-extension://") || details.url.startsWith("about:")) {
    return;
  }

  try {
    const currentHost = new URL(state.lockedUrl).hostname;
    const targetHost = new URL(details.url).hostname;

    if (currentHost !== targetHost) {
      // Prevent overwriting the pinned tab (restore the pinned URL)
      await chrome.tabs.update(tabId, { url: state.lockedUrl });

      // Open the new URL in a new tab or reuse an empty one
      await openUrlInNormalTab(state.windowId, details.url);
      console.log(`Diverted navigation from pinned tab (${tabId}): ${state.lockedUrl} -> ${details.url}`);
    }
  } catch (e) {
    console.error("Error processing onBeforeNavigate:", e);
  }
});

// Message handling from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.action === "checkIfPinned") {
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") {
      const state = tabState.get(tabId);
      sendResponse({ pinned: Boolean(state?.pinned) });
    } else {
      sendResponse({ pinned: false });
    }
    return true; // Enable asynchronous response
  }

  if (message.action === "openInNewTab") {
    const windowId = sender.tab?.windowId;
    openUrlInNormalTab(windowId, message.url);
  }
});