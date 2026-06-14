// Pinned Tab Escape - Content Script
// Intercepts link clicks on pinned tabs to prevent overwriting them.

let isPinned = false;

// Check with the background script if this tab is pinned
chrome.runtime.sendMessage({ action: "checkIfPinned" }, (response) => {
  if (response && typeof response.pinned === "boolean") {
    isPinned = response.pinned;
  }
});

// Listen for messages from the background script (if the pin state changes dynamically)
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.action === "setPinned") {
    isPinned = message.pinned;
  }
});

// Intercept clicks on the page
document.addEventListener("click", (event) => {
  if (!isPinned) return;

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

    // If the target domain differs from the current tab's domain
    if (targetUrl.hostname !== currentUrl.hostname) {
      // Prevent navigation on the current tab
      event.preventDefault();
      event.stopPropagation();

      // Request the background script to open the link in a new tab
      chrome.runtime.sendMessage({
        action: "openInNewTab",
        url: targetUrl.href
      });
    }
  } catch (err) {
    console.error("Error while processing the URL:", err);
  }
}, true); // Capture phase listener to run before the page's own scripts
