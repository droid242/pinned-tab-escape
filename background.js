// Pinned Tab Escape & Protection
// Chrome/Edge/Brave MV3 extension
//
// Goals:
// 1. Pinned tab focus protection when closing tabs (redirect focus away from pinned tabs to a regular or new tab).
// 2. Tab group & pinned tab navigation protection (external links, address bar, bookmarks open outside the group).
// 3. New tabs spawned from protected tabs (target="_blank", window.open) are placed OUTSIDE the group.
// 4. Base URL tracking & automatic restoration on startup and workspace window load.

const tabState = new Map();       // tabId -> { windowId, pinned, groupId, url, baseUrl, lockedHost, isProtected }
const normalHistory = new Map();  // windowId -> [tabId, tabId, ...]

function isWebUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

function isExactOrCloseUrl(url1, url2) {
  if (url1 === url2) return true;
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.origin === u2.origin &&
      u1.pathname === u2.pathname &&
      u1.search === u2.search;
  } catch {
    return false;
  }
}

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

function isProtected(tab) {
  if (!tab) return false;
  const isPinned = Boolean(tab.pinned);
  const isGrouped = typeof tab.groupId === "number" && tab.groupId > -1;
  return isPinned || isGrouped;
}

let saveTimeout = null;
function scheduleSaveState() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await saveState();
  }, 400);
}

// Persist the state of pinned and grouped tabs with their base URLs
async function saveState() {
  try {
    // 1. Pinned tabs
    const pinnedTabs = await chrome.tabs.query({ pinned: true });
    const savedPinnedTabs = pinnedTabs.map(t => {
      const state = tabState.get(t.id);
      const effectiveUrl = state?.baseUrl || t.url;
      let host = null;
      try { host = new URL(effectiveUrl).hostname; } catch { }
      return {
        url: effectiveUrl,
        index: t.index,
        hostname: host
      };
    }).filter(t => isWebUrl(t.url));

    // 2. Grouped tabs
    let savedGroupTabs = [];
    if (chrome.tabGroups) {
      try {
        const allGroups = await chrome.tabGroups.query({});
        const groupMap = new Map(allGroups.map(g => [g.id, g]));
        const groupedTabs = await chrome.tabs.query({ pinned: false });
        const tabsInGroups = groupedTabs.filter(t => typeof t.groupId === "number" && t.groupId > -1);

        const groupTabCounts = new Map();
        savedGroupTabs = tabsInGroups.map(t => {
          const group = groupMap.get(t.groupId);
          const state = tabState.get(t.id);
          const indexInGroup = groupTabCounts.get(t.groupId) || 0;
          groupTabCounts.set(t.groupId, indexInGroup + 1);

          const effectiveUrl = state?.baseUrl || t.url;
          let host = null;
          try { host = new URL(effectiveUrl).hostname; } catch { }

          return {
            groupTitle: group?.title || "",
            groupColor: group?.color || "",
            indexInGroup: indexInGroup,
            baseUrl: effectiveUrl,
            hostname: host
          };
        }).filter(t => isWebUrl(t.baseUrl));
      } catch (e) {
        console.error("Error reading tab groups for saving:", e);
      }
    }

    await chrome.storage.local.set({ savedPinnedTabs, savedGroupTabs });
  } catch (e) {
    console.error("Error saving tabs state:", e);
  }
}

function rememberTab(tab) {
  if (!tab || typeof tab.id !== "number") return;
  const existing = tabState.get(tab.id);

  const protectedNow = isProtected(tab);
  const protectedBefore = existing?.isProtected || false;

  let baseUrl = existing?.baseUrl || null;
  let lockedHost = existing?.lockedHost || null;

  if (protectedNow) {
    // If it just became protected or previously had no base URL yet
    if (!protectedBefore || !baseUrl) {
      if (isWebUrl(tab.url)) {
        baseUrl = tab.url;
        try {
          lockedHost = new URL(tab.url).hostname;
        } catch {
          lockedHost = null;
        }
      }
    } else if (tab.url && isWebUrl(tab.url)) {
      // Already protected and has a base URL
      try {
        const currentHost = new URL(tab.url).hostname;
        if (lockedHost !== currentHost) {
          // If the host somehow changed legitimately (e.g. redirected on initial setup)
          // we keep the host consistent if baseUrl hasn't set one yet
        }
      } catch { }
    }
  } else {
    // Tab is neither pinned nor in a group -> unprotect and clear base URL
    baseUrl = null;
    lockedHost = null;
  }

  tabState.set(tab.id, {
    windowId: tab.windowId,
    pinned: Boolean(tab.pinned),
    groupId: typeof tab.groupId === "number" ? tab.groupId : -1,
    url: tab.url,
    baseUrl: baseUrl,
    lockedHost: lockedHost,
    isProtected: protectedNow
  });

  // Sync protection state with the content script
  chrome.tabs.sendMessage(tab.id, {
    action: "setProtection",
    protected: protectedNow
  }).catch(() => { });
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

  // Avoid growing infinitely
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

  // 1) First, try the most recently used regular tab
  for (const tabId of history) {
    const tab = await getTabSafe(tabId);
    if (tab && !tab.pinned && tab.windowId === windowId) {
      await chrome.tabs.update(tab.id, { active: true });
      return true;
    }
  }

  // 2) Look for any unpinned tab
  const normalTabs = await chrome.tabs.query({ windowId, pinned: false });
  const usableTabs = normalTabs.filter(tab => !tab.discarded || typeof tab.discarded === "boolean");

  if (usableTabs.length > 0) {
    usableTabs.sort((a, b) => a.index - b.index);
    await chrome.tabs.update(usableTabs[0].id, { active: true });
    return true;
  }

  // 3) If there are no regular tabs, open a new empty tab
  await chrome.tabs.create({
    windowId,
    url: "chrome://newtab/",
    active: true,
    pinned: false
  });

  return true;
}

// Helper to open a URL outside of any group or pinned state
async function openUrlInNormalTab(windowId, url) {
  try {
    const queryInfo = { pinned: false };
    if (typeof windowId === "number") {
      queryInfo.windowId = windowId;
    }
    const normalTabs = await chrome.tabs.query(queryInfo);

    // Find an unpinned AND ungrouped empty tab
    const emptyTab = normalTabs.find(tab => {
      const isUngrouped = !tab.groupId || tab.groupId === -1 || (chrome.tabGroups && tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE);
      if (!isUngrouped) return false;

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
      const createInfo = { url: url, active: true, pinned: false };
      if (typeof windowId === "number") {
        createInfo.windowId = windowId;
      }
      const createdTab = await chrome.tabs.create(createInfo);
      // Ensure the newly created tab is outside any group
      if (createdTab.groupId && createdTab.groupId > -1) {
        try {
          await chrome.tabs.ungroup(createdTab.id);
        } catch (e) { }
      }
      console.log(`New tab created outside group for: ${url}`);
    }
  } catch (err) {
    console.error("Error opening/updating tab:", err);
  }
}

// Enforces base URLs for pinned tabs and tab groups (on startup and when opening workspaces/windows)
async function restoreBaseUrls(targetWindowId = null) {
  try {
    const data = await chrome.storage.local.get(["savedPinnedTabs", "savedGroupTabs"]);
    const savedPinned = data.savedPinnedTabs || [];
    const savedGroup = data.savedGroupTabs || [];

    const query = typeof targetWindowId === "number" ? { windowId: targetWindowId } : {};
    const tabs = await chrome.tabs.query(query);

    // 1. Pinned tabs restoration & base URL enforcement
    const pinnedTabs = tabs.filter(t => t.pinned);
    for (const tab of pinnedTabs) {
      const state = tabState.get(tab.id);
      let currentHost = null;
      try { currentHost = new URL(tab.url).hostname; } catch { }

      const match = savedPinned.find(s => (currentHost && s.hostname === currentHost) || s.index === tab.index);
      if (match && match.baseUrl) {
        if (state) {
          state.baseUrl = match.baseUrl;
          state.lockedHost = match.hostname;
        }
        if (tab.url && !isExactOrCloseUrl(tab.url, match.baseUrl)) {
          console.log(`Enforcing base URL for pinned tab ${tab.id}: ${tab.url} -> ${match.baseUrl}`);
          await chrome.tabs.update(tab.id, { url: match.baseUrl });
        }
      }
    }

    // Recreate missing pinned tabs on full startup if browser failed to restore them
    if (targetWindowId === null && savedPinned.length > 0) {
      const currentPinnedAll = await chrome.tabs.query({ pinned: true });
      const windows = await chrome.windows.getAll({ populate: false });
      if (windows.length > 0) {
        const firstWinId = windows[0].id;
        for (const savedTab of savedPinned) {
          const isOpen = currentPinnedAll.some(t => isSimilarUrl(t.url, savedTab.url));
          if (!isOpen && isWebUrl(savedTab.url)) {
            try {
              await chrome.tabs.create({
                windowId: firstWinId,
                url: savedTab.url,
                pinned: true,
                active: false,
                index: savedTab.index
              });
              console.log("Recreated missing pinned tab:", savedTab.url);
            } catch (e) {
              console.error("Failed to recreate pinned tab:", savedTab.url, e);
            }
          }
        }
      }
    }

    // 2. Grouped tabs base URL enforcement
    if (chrome.tabGroups && savedGroup.length > 0) {
      const groupQuery = typeof targetWindowId === "number" ? { windowId: targetWindowId } : {};
      const allGroups = await chrome.tabGroups.query(groupQuery);
      const groupMap = new Map(allGroups.map(g => [g.id, g]));
      const groupedTabs = tabs.filter(t => typeof t.groupId === "number" && t.groupId > -1);

      const groupTabCounts = new Map();
      for (const tab of groupedTabs) {
        const group = groupMap.get(tab.groupId);
        const indexInGroup = groupTabCounts.get(tab.groupId) || 0;
        groupTabCounts.set(tab.groupId, indexInGroup + 1);

        let currentHost = null;
        try { currentHost = new URL(tab.url).hostname; } catch { }

        // Match by title + host, or color + index + host, or unique host match
        let match = null;
        if (group?.title) {
          match = savedGroup.find(s => s.groupTitle === group.title && s.hostname === currentHost);
        }
        if (!match && group?.color) {
          match = savedGroup.find(s => s.groupColor === group.color && s.indexInGroup === indexInGroup && s.hostname === currentHost);
        }
        if (!match && currentHost) {
          match = savedGroup.find(s => s.hostname === currentHost);
        }

        if (match && match.baseUrl) {
          const state = tabState.get(tab.id);
          if (state) {
            state.baseUrl = match.baseUrl;
            state.lockedHost = match.hostname;
          }
          if (tab.url && !isExactOrCloseUrl(tab.url, match.baseUrl)) {
            console.log(`Enforcing base URL for grouped tab ${tab.id}: ${tab.url} -> ${match.baseUrl}`);
            await chrome.tabs.update(tab.id, { url: match.baseUrl });
          }
        }
      }
    }
  } catch (err) {
    console.error("Error in restoreBaseUrls:", err);
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

// Lifecycle listeners
chrome.runtime.onInstalled.addListener(async () => {
  await initializeState();
  scheduleSaveState();
});

// Browser startup: two-step restoration
chrome.runtime.onStartup.addListener(async () => {
  console.log("Browser startup detected, initializing state and running two-step restoration.");
  await initializeState();

  setTimeout(async () => {
    console.log("Step 1 base URL restoration check...");
    await restoreBaseUrls();
  }, 1500);

  setTimeout(async () => {
    console.log("Step 2 base URL restoration check...");
    await restoreBaseUrls();
  }, 4000);
});

// Detect when a new window opens (e.g. Edge Workspace opened later during the day)
chrome.windows.onCreated.addListener(async (window) => {
  setTimeout(async () => {
    await restoreBaseUrls(window.id);
  }, 1500);
});

// Tab events
chrome.tabs.onCreated.addListener(async (tab) => {
  rememberTab(tab);
  if (tab.active && !tab.pinned) {
    touchNormalTab(tab);
  }

  // If this tab was spawned from an existing tab (e.g. target="_blank", window.open)
  if (tab.openerTabId) {
    const opener = await getTabSafe(tab.openerTabId);
    // If the opener was pinned or grouped, ensure the new tab opens OUTSIDE the group
    if (opener && isProtected(opener)) {
      if (typeof tab.groupId === "number" && tab.groupId > -1) {
        try {
          await chrome.tabs.ungroup(tab.id);
          console.log(`Ungrouped new tab (${tab.id}) spawned from protected tab (${opener.id})`);
        } catch (e) { }
      }
    }
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  rememberTab(tab);

  // If a tab spawned from a protected tab gets automatically added to group by browser, ungroup it
  if (typeof changeInfo.groupId === "number" && changeInfo.groupId > -1 && tab.openerTabId) {
    const opener = await getTabSafe(tab.openerTabId);
    if (opener && isProtected(opener)) {
      try {
        await chrome.tabs.ungroup(tabId);
        console.log(`Ungrouped tab (${tabId}) on update because opener was protected`);
      } catch (e) { }
    }
  }

  if (typeof changeInfo.pinned === "boolean") {
    if (changeInfo.pinned) {
      removeFromHistory(tab.windowId, tabId);
    } else if (tab.active) {
      touchNormalTab(tab);
    }
    scheduleSaveState();
  } else if (typeof changeInfo.groupId === "number") {
    scheduleSaveState();
  } else if (changeInfo.url) {
    // If URL changed and tab is protected
    if (isProtected(tab)) {
      scheduleSaveState();
    }
  }
});

chrome.tabs.onMoved.addListener(async (tabId) => {
  const tab = await getTabSafe(tabId);
  if (tab && isProtected(tab)) {
    scheduleSaveState();
  }
});

if (chrome.tabGroups) {
  chrome.tabGroups.onUpdated.addListener(() => {
    scheduleSaveState();
  });
  chrome.tabGroups.onRemoved.addListener(() => {
    scheduleSaveState();
  });
}

// When a tab is activated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await getTabSafe(activeInfo.tabId);
  if (!tab) return;

  rememberTab(tab);

  if (tab.pinned) {
    removeFromHistory(activeInfo.windowId, activeInfo.tabId);
  } else {
    touchNormalTab(tab);
  }
});

// When a tab is closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const old = tabState.get(tabId);
  const windowId = removeInfo.windowId ?? old?.windowId;

  if (old?.windowId !== undefined) {
    removeFromHistory(old.windowId, tabId);
  }

  tabState.delete(tabId);

  // Focus protection: ONLY for pinned tabs.
  // Grouped tabs do not require a buffer tab on close.
  if (old?.pinned) {
    scheduleSaveState();
    return;
  }

  // The closed tab was a regular tab. Check if focus fell on a pinned tab.
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

  scheduleSaveState();
});

// Divert external navigations initiated from the address bar or bookmarks on protected tabs
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only monitor main frame navigation

  const tabId = details.tabId;
  const state = tabState.get(tabId);
  if (!state || !state.isProtected || !state.lockedHost) return;

  // Skip browser-internal pages and extensions
  if (details.url.startsWith("chrome://") ||
    details.url.startsWith("edge://") ||
    details.url.startsWith("chrome-extension://") ||
    details.url.startsWith("about:")) {
    return;
  }

  try {
    const targetHost = new URL(details.url).hostname;

    if (state.lockedHost !== targetHost) {
      // Revert the protected tab to its base or current valid in-domain URL
      const revertUrl = state.url || state.baseUrl;
      if (revertUrl) {
        await chrome.tabs.update(tabId, { url: revertUrl });
      }

      // Open the new URL outside any group in a normal tab
      await openUrlInNormalTab(state.windowId, details.url);
      console.log(`Diverted navigation from protected tab (${tabId}): ${revertUrl} -> ${details.url}`);
    }
  } catch (e) {
    console.error("Error processing onBeforeNavigate:", e);
  }
});

// Message handling from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.action === "checkProtection" || message.action === "checkIfPinned") {
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") {
      const state = tabState.get(tabId);
      sendResponse({
        protected: Boolean(state?.isProtected),
        pinned: Boolean(state?.pinned)
      });
    } else {
      sendResponse({ protected: false, pinned: false });
    }
    return true; // Asynchronous response
  }

  if (message.action === "openInNewTab") {
    const windowId = sender.tab?.windowId;
    openUrlInNormalTab(windowId, message.url);
  }
});
