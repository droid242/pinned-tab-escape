// Pinned Tab Escape / Protection
// Chrome/Edge/Brave MV3 extension
//
// Célok:
// 1. Rögzített lapvédelem bezáráskor (ha a fókusz rögzített lapra esne, átirányítjuk normál lapra vagy új lapra).
// 2. Rögzített lapok helyreállítása indításkor kétlépcsős ellenőrzéssel (1.5s és 4s).
// 3. Navigáció eltérítése rögzített lapokról (címsor, könyvjelzők és külső linkek új lapon nyílnak meg).

const tabState = new Map();       // tabId -> { windowId, pinned, url, lockedUrl }
const normalHistory = new Map();  // windowId -> [tabId, tabId, ...]

// Rögzített lapok állapotának mentése a storage-ba
async function savePinnedTabsState() {
  try {
    const tabs = await chrome.tabs.query({ pinned: true });
    const pinnedData = tabs.map(t => ({
      url: t.url,
      index: t.index
    }));
    await chrome.storage.local.set({ savedPinnedTabs: pinnedData });
    console.log("Rögzített lapok mentve:", pinnedData);
  } catch (e) {
    console.error("Hiba a rögzített lapok mentésekor:", e);
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
          lockedUrl = tab.url; // Frissítjük a zárolt URL-t azonos domainen belüli navigációnál
        }
      } catch {
        // Hiba esetén megtartjuk a régit
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

  // Szinkronizáljuk a content scripttel a rögzített állapotot
  chrome.tabs.sendMessage(tab.id, { action: "setPinned", pinned: Boolean(tab.pinned) }).catch(() => {
    // Esetleges hiba elnyomása, ha a content script még nem töltődött be a lapon
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

  // Ne nöjön végtelenre.
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

  // 1) Először próbáljuk a legutóbb használt normál lapot.
  for (const tabId of history) {
    const tab = await getTabSafe(tabId);
    if (tab && !tab.pinned && tab.windowId === windowId) {
      await chrome.tabs.update(tab.id, { active: true });
      return true;
    }
  }

  // 2) Keresünk bármilyen nem rögzített lapot.
  const normalTabs = await chrome.tabs.query({ windowId, pinned: false });
  const usableTabs = normalTabs.filter(tab => !tab.discarded || typeof tab.discarded === "boolean");

  if (usableTabs.length > 0) {
    usableTabs.sort((a, b) => a.index - b.index);
    await chrome.tabs.update(usableTabs[0].id, { active: true });
    return true;
  }

  // 3) Ha nincs normál lap, nyissunk egy új üres lapot.
  await chrome.tabs.create({
    windowId,
    url: "chrome://newtab/",
    active: true,
    pinned: false
  });

  return true;
}

// Intelligens URL-összehasonlítás a duplikációk elkerülésére
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

// Helyreállítási logika indításkor
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
        console.log("Sikeresen helyreállított rögzített lap:", savedTab.url);
      } catch (e) {
        console.error("Nem sikerült helyreállítani a rögzített lapot:", savedTab.url, e);
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

// Induláskor töltsük fel az állapotot és mentsük le.
chrome.runtime.onInstalled.addListener(async () => {
  await initializeState();
  await savePinnedTabsState();
});

// Kétlépcsős helyreállítás indításkor
chrome.runtime.onStartup.addListener(async () => {
  console.log("Böngésző indítás észlelve, állapot inicializálása és kétlépcsős helyreállítás.");
  await initializeState();

  setTimeout(async () => {
    console.log("1. lépcsős helyreállítási ellenőrzés...");
    await restorePinnedTabsIfNeeded();
  }, 1500);

  setTimeout(async () => {
    console.log("2. lépcsős helyreállítási ellenőrzés...");
    await restorePinnedTabsIfNeeded();
  }, 4000);
});

// Ha létrejön vagy frissül egy lap, jegyezzük meg.
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

// Ha aktiválsz egy lapot.
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

// Bezáráskor ellenőrizzük a helyzetet.
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

  // A bezárt lap normál lap volt. Adjunk időt a Chrome-nak a fókusz váltásra.
  setTimeout(async () => {
    try {
      const [activeTab] = await chrome.tabs.query({ windowId, active: true });
      if (activeTab && activeTab.pinned) {
        await activateBestNormalTab(windowId);
      }
    } catch (err) {
      console.error("Hiba a fókusz korrigálásakor:", err);
    }
  }, 50);

  await savePinnedTabsState();
});

// Címsorból vagy könyvjelzőkből indított külső navigációk eltérítése rögzített lapokon
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // Csak a főoldal navigációt figyeljük

  const tabId = details.tabId;
  const state = tabState.get(tabId);
  if (!state || !state.pinned || !state.lockedUrl) return;

  // Kivételek: belső böngésző oldalak és az extension oldalai
  if (details.url.startsWith("chrome://") || details.url.startsWith("chrome-extension://") || details.url.startsWith("about:")) {
    return;
  }

  try {
    const currentHost = new URL(state.lockedUrl).hostname;
    const targetHost = new URL(details.url).hostname;

    if (currentHost !== targetHost) {
      // Megakadályozzuk a rögzített lap felülírását (visszaállítjuk a rögzített URL-t)
      await chrome.tabs.update(tabId, { url: state.lockedUrl });

      // Megnyitjuk az új URL-t egy új fülön
      await chrome.tabs.create({
        windowId: state.windowId,
        url: details.url,
        active: true
      });
      console.log(`Eltérített navigáció rögzített lapról (${tabId}): ${state.lockedUrl} -> ${details.url}`);
    }
  } catch (e) {
    console.error("Hiba az onBeforeNavigate feldolgozásakor:", e);
  }
});

// Üzenetkezelés a content.js-től
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
    return true; // Aszinkron válaszküldés engedélyezése
  }

  if (message.action === "openInNewTab") {
    const windowId = sender.tab?.windowId;
    chrome.tabs.create({
      windowId: windowId,
      url: message.url,
      active: true
    }).catch(err => console.error("Hiba a fül megnyitásakor:", err));
  }
});