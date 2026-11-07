// Pinned Tab Escape - Content Script
// Intercepts link clicks on protected tabs (pinned tabs and tabs in tab groups)
// to prevent overwriting them and to ensure new pages open outside groups.

let isProtected = false;

// Check with the background script if this tab is protected (pinned or in a group)
chrome.runtime.sendMessage({ action: "checkProtection" }, (response) => {
  if (response && typeof response.protected === "boolean") {
    isProtected = response.protected;
  }
});

// Listen for protection state changes dynamically from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message && typeof message.protected === "boolean") {
    isProtected = message.protected;
  } else if (message && typeof message.pinned === "boolean") {
    isProtected = message.pinned;
  }
});

// Intercept clicks on the page
document.addEventListener("click", (event) => {
  if (!isProtected) return;

  // Find the closest <a> (link) element
  const anchor = event.target.closest("a");
  if (!anchor) return;

  // Only listen for normal left-clicks (without Ctrl, Shift, Alt, or Meta keys)
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return;
  }

  // If it has no URL or is a javascript: link, do nothing
  if (!anchor.href || anchor.href.startsWith("javascript:")) {
    return;
  }

  try {
    const targetUrl = new URL(anchor.href, window.location.href);
    const currentUrl = new URL(window.location.href);

    const isExternal = targetUrl.hostname !== currentUrl.hostname;
    const opensInNewTab = anchor.target === "_blank" || anchor.target === "_new";

    // If external domain OR the link is set to open in a new tab:
    // Divert it so it opens in a normal tab OUTSIDE the tab group / pinned state
    if (isExternal || opensInNewTab) {
      event.preventDefault();
      event.stopPropagation();

      chrome.runtime.sendMessage({
        action: "openInNewTab",
        url: targetUrl.href
      });
    }
  } catch (err) {
    console.error("Error while processing the URL:", err);
  }
}, true); // Capture phase listener to run before the page's own scripts
