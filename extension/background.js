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

// ========== Badge ==========

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

// ========== Daily Backup ==========

const BACKUP_ALARM_NAME = 'daily-tab-backup';
const BACKUP_INTERVAL_MINUTES = 24 * 60; // 24 hours

/**
 * Create a snapshot of all windows, groups, and tabs
 */
async function createBackup() {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    let tabGroups = [];
    try {
      tabGroups = await chrome.tabGroups.query({});
    } catch (e) {
      console.warn('tabGroups API not available:', e);
    }

    // Build group info map
    const groupMap = {};
    tabGroups.forEach(g => {
      groupMap[g.id] = {
        title: g.title || 'Unnamed Group',
        color: g.color || 'grey',
        collapsed: g.collapsed || false
      };
    });

    // Build backup data
    const backup = {
      timestamp: Date.now(),
      date: new Date().toLocaleString(),
      windows: []
    };

    windows.forEach(win => {
      if (win.type !== 'normal') return;

      const winData = {
        focused: win.focused,
        tabs: []
      };

      win.tabs.forEach(tab => {
        if (!tab.url || INTERNAL_PREFIXES.some(prefix => tab.url.startsWith(prefix))) return;

        winData.tabs.push({
          url: tab.url,
          title: tab.title || '',
          pinned: tab.pinned || false,
          groupId: tab.groupId,
          groupTitle: tab.groupId > 0 ? (groupMap[tab.groupId]?.title || '') : '',
          groupColor: tab.groupId > 0 ? (groupMap[tab.groupId]?.color || '') : ''
        });
      });

      if (winData.tabs.length > 0) {
        backup.windows.push(winData);
      }
    });

    // Save backup (overwrite previous)
    await chrome.storage.local.set({ tabBackup: backup });
    console.log(`[Tab Groups Dashboard] Backup saved: ${backup.windows.length} windows, ${backup.windows.reduce((s, w) => s + w.tabs.length, 0)} tabs at ${backup.date}`);
  } catch (e) {
    console.error('[Tab Groups Dashboard] Backup failed:', e);
  }
}

/**
 * Setup daily backup alarm
 */
function setupBackupAlarm() {
  chrome.alarms.get(BACKUP_ALARM_NAME, (alarm) => {
    if (!alarm) {
      // Create alarm: fires every 24 hours, first fire in 1 minute
      chrome.alarms.create(BACKUP_ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: BACKUP_INTERVAL_MINUTES
      });
      console.log('[Tab Groups Dashboard] Daily backup alarm created');
    }
  });
}

// ========== Event Listeners ==========

// Extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  setupBackupAlarm();
  // Run an immediate backup on install
  createBackup();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  setupBackupAlarm();
});

// Alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BACKUP_ALARM_NAME) {
    createBackup();
  }
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
