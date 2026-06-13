// Pinned Tab Escape - Content Script
// Intercepts link clicks on pinned tabs to prevent overwriting them.

let isPinned = false;

// Lekérdezzük a háttér-scripttől, hogy ez a lap rögzítve van-e
chrome.runtime.sendMessage({ action: "checkIfPinned" }, (response) => {
  if (response && typeof response.pinned === "boolean") {
    isPinned = response.pinned;
  }
});

// Figyeljük a háttér-script üzeneteit (ha dinamikusan változik a rögzítés állapota)
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.action === "setPinned") {
    isPinned = message.pinned;
  }
});

// Elfogjuk a kattintásokat a lapon
document.addEventListener("click", (event) => {
  if (!isPinned) return;

  // Megkeressük a legközelebbi <a> (link) elemet
  const anchor = event.target.closest("a");
  if (!anchor) return;

  // Csak a normál bal-kattintásokat figyeljük (Ctrl, Shift, Alt nélkül)
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return;
  }

  // Ha nincs URL-je vagy javascript: link, ne csináljunk semmit
  if (!anchor.href || anchor.href.startsWith("javascript:")) {
    return;
  }

  try {
    const targetUrl = new URL(anchor.href, window.location.href);
    const currentUrl = new URL(window.location.href);

    // Ha a céldomain eltér a jelenlegi lap domainjétől
    if (targetUrl.hostname !== currentUrl.hostname) {
      // Megakadályozzuk az aktuális lapon történő navigációt
      event.preventDefault();
      event.stopPropagation();

      // Kérjük a háttér-scriptet, hogy nyissa meg új fülön a linket
      chrome.runtime.sendMessage({
        action: "openInNewTab",
        url: targetUrl.href
      });
    }
  } catch (err) {
    console.error("Hiba az URL feldolgozása közben:", err);
  }
}, true); // A capture fázisban kapjuk el, hogy a lap saját scriptjei előtt lefusson
