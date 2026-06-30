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
const BACKUP_VERSION = '2.0';

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
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      date: new Date().toISOString(),
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

    // Save backup to chrome.storage.local (overwrite previous)
    await chrome.storage.local.set({ tabBackup: backup });

    // Also save to persistent file via OPFS (Origin Private File System)
    await saveBackupToFile(backup);

    const totalTabs = backup.windows.reduce((s, w) => s + w.tabs.length, 0);
    console.log(`[Tab Groups Dashboard] Backup saved: ${backup.windows.length} windows, ${totalTabs} tabs at ${backup.date}`);
  } catch (e) {
    console.error('[Tab Groups Dashboard] Backup failed:', e);
  }
}

/**
 * Save backup to Origin Private File System (persists across browser restarts)
 * OPFS is available in service workers and is truly persistent on disk.
 */
async function saveBackupToFile(backup) {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle('tab-backup-latest.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(backup, null, 2));
    await writable.close();

    // Also keep a timestamped copy (max 3 backups)
    const timestampedName = `tab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const tsHandle = await root.getFileHandle(timestampedName, { create: true });
    const tsWritable = await tsHandle.createWritable();
    await tsWritable.write(JSON.stringify(backup, null, 2));
    await tsWritable.close();

    // Cleanup old backups (keep latest 3 daily files)
    await cleanupOldBackups(root);
  } catch (e) {
    console.warn('[Tab Groups Dashboard] OPFS backup failed (non-critical):', e);
  }
}

/**
 * Clean up old backup files in OPFS, keep only latest 3 daily backups
 */
async function cleanupOldBackups(root) {
  try {
    const backupFiles = [];
    for await (const [name, handle] of root) {
      if (name.startsWith('tab-backup-') && name !== 'tab-backup-latest.json' && name.endsWith('.json')) {
        backupFiles.push(name);
      }
    }
    // Sort descending (newest first)
    backupFiles.sort().reverse();
    // Remove files beyond the 3 most recent
    for (let i = 3; i < backupFiles.length; i++) {
      await root.removeEntry(backupFiles[i]);
    }
  } catch (e) {
    // Non-critical cleanup error
  }
}

/**
 * Read backup from OPFS (fallback if chrome.storage.local is empty)
 */
async function readBackupFromFile() {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle('tab-backup-latest.json');
    const file = await fileHandle.getFile();
    const content = await file.text();
    return JSON.parse(content);
  } catch (e) {
    return null;
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

// ========== Message Handler ==========
// Allow the frontend (app.js) to communicate with the service worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'createBackup') {
    createBackup().then(() => {
      sendResponse({ success: true });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true; // async response
  }

  if (message.action === 'getBackupFromFile') {
    readBackupFromFile().then(backup => {
      sendResponse({ success: true, backup });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  if (message.action === 'exportBackup') {
    // Read from OPFS and return for download
    readBackupFromFile().then(backup => {
      sendResponse({ success: true, backup });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
});

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
  // Also backup on browser startup to ensure we have a fresh copy
  createBackup();
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
