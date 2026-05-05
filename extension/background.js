/* =========================================
   Tab Groups Dashboard — Background Service Worker
   ========================================= */

// Internal URL prefixes to filter out
const INTERNAL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'edge://',
  'brave://'
];

/**
 * Update the extension badge with tab count and color coding
 */
async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});
    const realTabs = tabs.filter(tab =>
      tab.url && !INTERNAL_PREFIXES.some(prefix => tab.url.startsWith(prefix))
    );

    const count = realTabs.length;
    const text = count === 0 ? '' : String(count);

    // Color coding by tab volume
    let color;
    if (count <= 10) {
      color = '#3d7a4a'; // Green - manageable
    } else if (count <= 20) {
      color = '#b8892e'; // Amber - getting busy
    } else if (count <= 40) {
      color = '#e8710a'; // Orange - lots of tabs
    } else {
      color = '#b35a5a'; // Red - tab overload
    }

    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {
    // Silently clear badge on error
    try {
      await chrome.action.setBadgeText({ text: '' });
    } catch {}
  }
}

// ========== Event Listeners ==========

// Extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Tab events
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    updateBadge();
  }
});

// Tab group events
chrome.tabGroups.onCreated.addListener(updateBadge);
chrome.tabGroups.onRemoved.addListener(updateBadge);
chrome.tabGroups.onUpdated.addListener(updateBadge);

// Window events
chrome.windows.onCreated.addListener(updateBadge);
chrome.windows.onRemoved.addListener(updateBadge);
chrome.windows.onFocusChanged.addListener(updateBadge);
