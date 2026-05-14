/* =========================================
   Tab Groups Dashboard — Core Application
   ========================================= */

(function () {
  'use strict';

  // ========== Constants ==========
  const CHROME_GROUP_COLORS = {
    grey: '#5f6368',
    blue: '#1a73e8',
    red: '#d93025',
    yellow: '#f9ab00',
    green: '#1e8e3e',
    pink: '#d01884',
    purple: '#9334e6',
    cyan: '#007b83',
    orange: '#e8710a'
  };

  const INTERNAL_URL_PREFIXES = [
    'chrome://',
    'chrome-extension://',
    'about:',
    'edge://',
    'brave://'
  ];

  // ========== State ==========
  let currentData = {};
  let favorites = [];
  let collapsedGroups = new Set();
  let collapsedWindows = new Set(); // Windows default to collapsed

  // ========== Initialization ==========
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    loadTheme();
    await loadCollapsedState();
    await loadWindowCollapsedState();
    await renderFavorites();
    await renderWindowGroups();
    renderStats();
    bindEventListeners();
    setupFaviconErrorHandler();
    setupAutoRefresh();
  }

  // ========== Theme ==========
  function loadTheme() {
    const saved = localStorage.getItem('tgd-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('tgd-theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon');
    const label = document.querySelector('.theme-label');
    if (icon) {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
    if (label) {
      label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
  }

  // ========== Greeting & Date (removed — kept for reference) ==========

  // ========== Data Layer: Fetch Tabs by Groups ==========
  async function fetchAllTabsByGroup() {
    const windows = await chrome.windows.getAll({ populate: true });
    let tabGroups = [];
    try {
      tabGroups = await chrome.tabGroups.query({});
    } catch (e) {
      // tabGroups API may not be available in all contexts
      console.warn('tabGroups API not available:', e);
    }

    // Build groupId -> group info map
    const groupMap = {};
    tabGroups.forEach(g => {
      groupMap[g.id] = {
        title: g.title || 'Unnamed Group',
        color: g.color || 'grey',
        collapsed: g.collapsed || false,
        windowId: g.windowId
      };
    });

    const result = {};
    let windowIndex = 0;

    windows.forEach(win => {
      // Skip devtools and other special windows
      if (win.type !== 'normal') return;

      windowIndex++;
      const winData = {
        windowId: win.id,
        windowName: win.focused ? 'Current Window' : `Window ${windowIndex}`,
        focused: win.focused,
        groups: {}
      };

      win.tabs.forEach(tab => {
        // Filter internal pages
        if (isInternalUrl(tab.url)) return;

        const gid = tab.groupId; // -1 means ungrouped
        if (!winData.groups[gid]) {
          if (gid === -1 || gid === chrome.tabGroups.TAB_GROUP_ID_NONE) {
            winData.groups[gid] = {
              title: 'Ungrouped',
              color: 'grey',
              collapsed: false,
              tabs: []
            };
          } else {
            winData.groups[gid] = {
              title: groupMap[gid]?.title || 'Unnamed Group',
              color: groupMap[gid]?.color || 'grey',
              collapsed: groupMap[gid]?.collapsed || false,
              tabs: []
            };
          }
        }

        winData.groups[gid].tabs.push({
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url,
          favIconUrl: tab.favIconUrl || '',
          active: tab.active,
          windowId: win.id,
          pinned: tab.pinned
        });
      });

      // Only add windows that have visible tabs
      const totalTabs = Object.values(winData.groups).reduce((sum, g) => sum + g.tabs.length, 0);
      if (totalTabs > 0) {
        result[win.id] = winData;
      }
    });

    currentData = result;
    return result;
  }

  function isInternalUrl(url) {
    if (!url) return true;
    return INTERNAL_URL_PREFIXES.some(prefix => url.startsWith(prefix));
  }

  // ========== Rendering: Window Groups ==========
  async function renderWindowGroups() {
    const data = await fetchAllTabsByGroup();
    const container = document.getElementById('windows-container');
    const emptyState = document.getElementById('empty-state');

    if (!container) return;
    container.innerHTML = '';

    const windowList = Object.values(data);

    if (windowList.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Sort: current window first
    windowList.sort((a, b) => {
      if (a.focused && !b.focused) return -1;
      if (!a.focused && b.focused) return 1;
      return 0;
    });

    windowList.forEach(win => {
      const card = createWindowCard(win);
      container.appendChild(card);
    });
  }

  function createWindowCard(win) {
    const card = document.createElement('div');
    card.className = `window-card ${win.focused ? 'window-active' : ''}`;
    card.setAttribute('data-window-id', win.windowId);

    const totalTabs = Object.values(win.groups).reduce((sum, g) => sum + g.tabs.length, 0);

    // Collect group names for display in header (exclude "Ungrouped")
    const groupTags = Object.entries(win.groups)
      .filter(([gid]) => String(gid) !== '-1')
      .map(([, group]) => ({
        title: group.title,
        color: group.color
      }));

    // Determine if window should be collapsed (default: collapsed)
    const winIdStr = String(win.windowId);
    const isExpanded = collapsedWindows.has(winIdStr); // inverted: set stores expanded windows
    if (!isExpanded) {
      card.classList.add('window-collapsed');
    }

    // Window header
    const header = document.createElement('div');
    header.className = 'window-header';

    // Build group tags HTML
    let groupTagsHtml = '';
    if (groupTags.length > 0) {
      const tagsToShow = groupTags.slice(0, 5); // Show max 5 group tags
      const remaining = groupTags.length - tagsToShow.length;
      groupTagsHtml = '<div class="window-group-tags">' +
        tagsToShow.map(g => {
          const color = CHROME_GROUP_COLORS[g.color] || CHROME_GROUP_COLORS.grey;
          return `<span class="window-group-tag" style="--tag-color: ${color}"><span class="tag-dot" style="background: ${color}"></span>${escapeHtml(g.title)}</span>`;
        }).join('') +
        (remaining > 0 ? `<span class="window-group-tag tag-more">+${remaining}</span>` : '') +
        '</div>';
    }

    header.innerHTML = `
      <button class="window-collapse-btn" aria-label="Toggle window">
        <span class="window-collapse-icon">▶</span>
      </button>
      <span class="window-icon">${win.focused ? '🖥️' : '💻'}</span>
      <span class="window-name">${win.windowName}</span>
      ${groupTagsHtml}
      <span class="window-tab-count">${totalTabs} tab${totalTabs !== 1 ? 's' : ''}</span>
      <button class="window-focus-btn" data-action="focus-window" data-window-id="${win.windowId}" title="Switch to this window">
        <span class="window-focus-icon">↗</span>
      </button>
    `;
    card.appendChild(header);

    // Window body (contains all groups)
    const body = document.createElement('div');
    body.className = 'window-body';

    // Sort groups: named groups first, ungrouped last
    const groups = Object.entries(win.groups).sort(([idA], [idB]) => {
      const a = Number(idA);
      const b = Number(idB);
      if (a === -1) return 1;
      if (b === -1) return -1;
      return 0;
    });

    groups.forEach(([groupId, group]) => {
      const block = createGroupBlock(group, groupId);
      body.appendChild(block);
    });

    card.appendChild(body);
    return card;
  }

  function createGroupBlock(group, groupId) {
    const block = document.createElement('div');
    block.className = 'group-block';
    block.setAttribute('data-group-id', groupId);
    block.setAttribute('data-color', group.color);

    // Check collapsed state
    if (collapsedGroups.has(String(groupId))) {
      block.classList.add('collapsed');
    }

    const color = CHROME_GROUP_COLORS[group.color] || CHROME_GROUP_COLORS.grey;

    // Group header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    groupHeader.innerHTML = `
      <span class="group-color-dot" style="background: ${color}"></span>
      <span class="group-title">${escapeHtml(group.title)}</span>
      <span class="group-count">${group.tabs.length}</span>
      <button class="group-collapse-btn" aria-label="Toggle group">▼</button>
    `;
    block.appendChild(groupHeader);

    // Tab list
    const tabList = document.createElement('div');
    tabList.className = 'tab-list';

    group.tabs.forEach(tab => {
      const tabRow = createTabRow(tab);
      tabList.appendChild(tabRow);
    });

    block.appendChild(tabList);
    return block;
  }

  function createTabRow(tab) {
    const row = document.createElement('div');
    row.className = `tab-row ${tab.active ? 'tab-active' : ''}`;
    row.setAttribute('data-tab-id', tab.id);
    row.setAttribute('data-window-id', tab.windowId);
    row.setAttribute('data-url', tab.url);

    const faviconSrc = tab.favIconUrl || getDefaultFavicon(tab.url);

    row.innerHTML = `
      <img class="tab-favicon" src="${escapeHtml(faviconSrc)}" alt="" />
      <span class="tab-title" title="${escapeHtml(tab.title)}${tab.pinned ? ' (Pinned)' : ''}">${tab.pinned ? '📌 ' : ''}${escapeHtml(tab.title)}</span>
      <div class="tab-actions">
        <button class="btn-favorite" title="Add to favorites" data-action="favorite">⭐</button>
        <button class="btn-close" title="Close tab" data-action="close">✕</button>
      </div>
    `;

    return row;
  }

  function getDefaultFavicon(url) {
    try {
      const u = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
    } catch {
      return 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><rect width=%2216%22 height=%2216%22 rx=%223%22 fill=%22%23e0e0e0%22/></svg>';
    }
  }

  // ========== Favorites ==========
  async function loadFavorites() {
    try {
      const result = await chrome.storage.local.get('favorites');
      favorites = result.favorites || [];
    } catch {
      favorites = [];
    }
    return favorites;
  }

  async function saveFavorites() {
    await chrome.storage.local.set({ favorites });
  }

  async function renderFavorites() {
    await loadFavorites();
    const grid = document.getElementById('favorites-grid');
    const emptyEl = document.getElementById('favorites-empty');

    if (!grid) return;
    grid.innerHTML = '';

    if (favorites.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    favorites.forEach((fav, index) => {
      const item = document.createElement('div');
      item.className = 'favorite-item';
      item.setAttribute('data-fav-index', index);
      item.setAttribute('data-url', fav.url);
      item.setAttribute('title', fav.url);
      item.setAttribute('draggable', 'true');

      const faviconSrc = fav.favIconUrl || getDefaultFavicon(fav.url);

      item.innerHTML = `
        <img class="fav-favicon" src="${escapeHtml(faviconSrc)}" alt="" />
        <span class="fav-title">${escapeHtml(fav.title || extractSiteNameFromUrl(fav.url))}</span>
        <button class="fav-remove" data-action="remove-fav" data-index="${index}" title="Remove">✕</button>
      `;

      grid.appendChild(item);
    });

    // Setup drag-and-drop after rendering
    setupFavoritesDragAndDrop();
  }

  async function addFavorite(url, title, favIconUrl) {
    // Deduplicate
    if (favorites.some(f => f.url === url)) {
      showToast('Already in favorites');
      return;
    }

    favorites.push({
      url,
      title: title || extractSiteNameFromUrl(url),
      favIconUrl: favIconUrl || '',
      addedAt: Date.now()
    });

    await saveFavorites();
    await renderFavorites();
    showToast('Added to favorites');
  }

  async function removeFavorite(index) {
    if (index >= 0 && index < favorites.length) {
      favorites.splice(index, 1);
      await saveFavorites();
      await renderFavorites();
      showToast('Removed from favorites');
    }
  }

  // ========== Favorites Drag & Drop ==========
  let dragSrcIndex = null;
  let isDragging = false;

  function setupFavoritesDragAndDrop() {
    const grid = document.getElementById('favorites-grid');
    if (!grid) return;

    const items = grid.querySelectorAll('.favorite-item');

    items.forEach(item => {
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);
      item.addEventListener('dragover', handleDragOver);
      item.addEventListener('dragenter', handleDragEnter);
      item.addEventListener('dragleave', handleDragLeave);
      item.addEventListener('drop', handleDrop);
    });
  }

  function handleDragStart(e) {
    dragSrcIndex = Number(this.getAttribute('data-fav-index'));
    isDragging = true;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIndex);
    // Make drag image slightly transparent
    setTimeout(() => this.classList.add('drag-ghost'), 0);
  }

  function handleDragEnd(e) {
    this.classList.remove('dragging', 'drag-ghost');
    // Clean up all drag states
    document.querySelectorAll('.favorite-item').forEach(item => {
      item.classList.remove('drag-over', 'drag-over-left', 'drag-over-right');
    });
    dragSrcIndex = null;
    // Reset isDragging after a short delay so click handler can check it
    setTimeout(() => { isDragging = false; }, 100);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Determine if we're on left or right half of the target
    const rect = this.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const isLeft = e.clientX < midX;

    this.classList.remove('drag-over-left', 'drag-over-right');
    this.classList.add(isLeft ? 'drag-over-left' : 'drag-over-right');
  }

  function handleDragEnter(e) {
    e.preventDefault();
    this.classList.add('drag-over');
  }

  function handleDragLeave(e) {
    this.classList.remove('drag-over', 'drag-over-left', 'drag-over-right');
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const targetIndex = Number(this.getAttribute('data-fav-index'));

    if (dragSrcIndex === null || dragSrcIndex === targetIndex) {
      this.classList.remove('drag-over', 'drag-over-left', 'drag-over-right');
      return;
    }

    // Determine drop position based on cursor
    const rect = this.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const dropAfter = e.clientX >= midX;

    // Reorder favorites array
    const [movedItem] = favorites.splice(dragSrcIndex, 1);
    let insertAt = dropAfter ? targetIndex : targetIndex;
    // Adjust index if we removed from before the target
    if (dragSrcIndex < targetIndex) {
      insertAt = dropAfter ? targetIndex : targetIndex - 1;
    } else {
      insertAt = dropAfter ? targetIndex + 1 : targetIndex;
    }
    favorites.splice(insertAt, 0, movedItem);

    await saveFavorites();
    await renderFavorites();
    showToast('Favorites reordered');
  }

  // ========== Stats ==========
  function renderStats() {
    const windowCount = Object.keys(currentData).length;
    let groupCount = 0;
    let tabCount = 0;

    Object.values(currentData).forEach(win => {
      Object.entries(win.groups).forEach(([gid, group]) => {
        if (String(gid) !== '-1') groupCount++;
        tabCount += group.tabs.length;
      });
    });

    const elWin = document.getElementById('stat-windows');
    const elGroup = document.getElementById('stat-groups');
    const elTabs = document.getElementById('stat-tabs');

    if (elWin) elWin.textContent = windowCount;
    if (elGroup) elGroup.textContent = groupCount;
    if (elTabs) elTabs.textContent = tabCount;
  }

  // ========== Tab Actions ==========
  async function focusTab(tabId, windowId) {
    try {
      await chrome.windows.update(windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
    } catch (e) {
      console.error('Failed to focus tab:', e);
      showToast('Could not switch to tab');
    }
  }

  async function focusWindow(windowId) {
    try {
      await chrome.windows.update(windowId, { focused: true });
      showToast('Switched to window');
    } catch (e) {
      console.error('Failed to focus window:', e);
      showToast('Could not switch to window');
    }
  }

  async function closeTab(tabId, rowElement) {
    try {
      // Animate removal
      if (rowElement) {
        rowElement.classList.add('removing');
        await sleep(300);
      }
      await chrome.tabs.remove(tabId);
      // Re-render after a short delay for the animation
      await sleep(100);
      await renderWindowGroups();
      renderStats();
      showToast('Tab closed');
    } catch (e) {
      console.error('Failed to close tab:', e);
      showToast('Could not close tab');
    }
  }

  // ========== Search ==========
  function filterTabs(query) {
    const lowerQuery = query.toLowerCase().trim();
    const allTabRows = document.querySelectorAll('.tab-row');
    const allGroupBlocks = document.querySelectorAll('.group-block');
    const allWindowCards = document.querySelectorAll('.window-card');

    if (!lowerQuery) {
      // Show everything
      allTabRows.forEach(row => row.style.display = '');
      allGroupBlocks.forEach(block => block.style.display = '');
      allWindowCards.forEach(card => card.style.display = '');
      return;
    }

    // Filter tabs
    allTabRows.forEach(row => {
      const title = (row.querySelector('.tab-title')?.textContent || '').toLowerCase();
      const url = (row.getAttribute('data-url') || '').toLowerCase();
      const matches = title.includes(lowerQuery) || url.includes(lowerQuery);
      row.style.display = matches ? '' : 'none';
    });

    // Hide empty groups
    allGroupBlocks.forEach(block => {
      const visibleTabs = block.querySelectorAll('.tab-row:not([style*="display: none"])');
      block.style.display = visibleTabs.length > 0 ? '' : 'none';
    });

    // Hide empty windows
    allWindowCards.forEach(card => {
      const visibleGroups = card.querySelectorAll('.group-block:not([style*="display: none"])');
      card.style.display = visibleGroups.length > 0 ? '' : 'none';
    });
  }

  // ========== Collapsed State ==========
  async function loadCollapsedState() {
    try {
      const result = await chrome.storage.local.get('collapsedGroups');
      collapsedGroups = new Set(result.collapsedGroups || []);
    } catch {
      collapsedGroups = new Set();
    }
  }

  async function saveCollapsedState() {
    await chrome.storage.local.set({ collapsedGroups: [...collapsedGroups] });
  }

  // ========== Window Collapsed State ==========
  // Note: We store EXPANDED windows (since default is collapsed)
  async function loadWindowCollapsedState() {
    try {
      const result = await chrome.storage.local.get('expandedWindows');
      collapsedWindows = new Set(result.expandedWindows || []);
    } catch {
      collapsedWindows = new Set();
    }
  }

  async function saveWindowCollapsedState() {
    await chrome.storage.local.set({ expandedWindows: [...collapsedWindows] });
  }

  function toggleWindowCollapse(windowCard) {
    const windowId = windowCard.getAttribute('data-window-id');
    windowCard.classList.toggle('window-collapsed');

    if (windowCard.classList.contains('window-collapsed')) {
      // Now collapsed, remove from expanded set
      collapsedWindows.delete(windowId);
    } else {
      // Now expanded, add to expanded set
      collapsedWindows.add(windowId);
    }
    saveWindowCollapsedState();
  }

  function toggleGroupCollapse(groupBlock) {
    const groupId = groupBlock.getAttribute('data-group-id');
    groupBlock.classList.toggle('collapsed');

    if (groupBlock.classList.contains('collapsed')) {
      collapsedGroups.add(groupId);
    } else {
      collapsedGroups.delete(groupId);
    }
    saveCollapsedState();
  }

  function collapseAllGroups() {
    document.querySelectorAll('.group-block').forEach(block => {
      block.classList.add('collapsed');
      collapsedGroups.add(block.getAttribute('data-group-id'));
    });
    saveCollapsedState();
  }

  function expandAllGroups() {
    document.querySelectorAll('.group-block').forEach(block => {
      block.classList.remove('collapsed');
    });
    collapsedGroups.clear();
    saveCollapsedState();
  }

  // ========== Event Listeners ==========
  function bindEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

    // Search
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');

    searchInput?.addEventListener('input', (e) => {
      const query = e.target.value;
      filterTabs(query);
      if (searchClear) {
        searchClear.style.display = query ? 'block' : 'none';
      }
    });

    searchClear?.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        filterTabs('');
        searchClear.style.display = 'none';
        searchInput.focus();
      }
    });

    // Keyboard shortcut: Ctrl/Cmd + K for search
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput?.focus();
      }
      // Escape to clear search
      if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.value = '';
        filterTabs('');
        if (searchClear) searchClear.style.display = 'none';
        searchInput.blur();
      }
    });

    // Quick actions
    document.getElementById('btn-collapse-all')?.addEventListener('click', collapseAllGroups);
    document.getElementById('btn-expand-all')?.addEventListener('click', expandAllGroups);

    // Backup actions
    document.getElementById('btn-backup-now')?.addEventListener('click', manualBackup);
    document.getElementById('btn-restore-backup')?.addEventListener('click', confirmRestoreBackup);
    loadBackupInfo();

    // Add favorite button
    document.getElementById('btn-add-favorite')?.addEventListener('click', showAddFavoriteModal);

    // Modal events
    document.getElementById('modal-close')?.addEventListener('click', hideModal);
    document.getElementById('modal-cancel')?.addEventListener('click', hideModal);
    document.getElementById('modal-confirm')?.addEventListener('click', confirmAddFavorite);
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) hideModal();
    });

    // Enter key to confirm in modal inputs
    const modalInputs = document.querySelectorAll('#fav-url, #fav-title');
    modalInputs.forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmAddFavorite();
        }
        if (e.key === 'Escape') {
          hideModal();
        }
      });
    });

    // Event delegation on main container
    document.querySelector('.main-column')?.addEventListener('click', handleMainClick);

    // Event delegation on favorites
    document.getElementById('favorites-grid')?.addEventListener('click', handleFavoriteClick);
  }

  function handleMainClick(e) {
    const target = e.target;

    // Click on window focus button -> jump to that window directly
    const focusWindowBtn = target.closest('[data-action="focus-window"]');
    if (focusWindowBtn) {
      const windowId = Number(focusWindowBtn.getAttribute('data-window-id'));
      focusWindow(windowId);
      e.stopPropagation();
      return;
    }

    // Click on window collapse button -> toggle window collapse
    const windowCollapseBtn = target.closest('.window-collapse-btn');
    if (windowCollapseBtn) {
      const windowCard = windowCollapseBtn.closest('.window-card');
      if (windowCard) {
        toggleWindowCollapse(windowCard);
      }
      return;
    }

    // Click on window header (but not buttons) -> toggle collapse
    const windowHeader = target.closest('.window-header');
    if (windowHeader && !target.closest('.window-collapse-btn') && !target.closest('.window-focus-btn')) {
      const windowCard = windowHeader.closest('.window-card');
      if (windowCard) {
        toggleWindowCollapse(windowCard);
      }
      return;
    }

    // Click on group header -> toggle collapse
    const groupHeader = target.closest('.group-header');
    if (groupHeader) {
      const groupBlock = groupHeader.closest('.group-block');
      if (groupBlock) {
        toggleGroupCollapse(groupBlock);
      }
      return;
    }

    // Click on tab action buttons
    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      const tabRow = actionBtn.closest('.tab-row');

      if (action === 'close' && tabRow) {
        const tabId = Number(tabRow.getAttribute('data-tab-id'));
        closeTab(tabId, tabRow);
        e.stopPropagation();
        return;
      }

      if (action === 'favorite' && tabRow) {
        const url = tabRow.getAttribute('data-url');
        const title = tabRow.querySelector('.tab-title')?.textContent || '';
        const favicon = tabRow.querySelector('.tab-favicon')?.src || '';
        addFavorite(url, title.replace('📌 ', ''), favicon);
        e.stopPropagation();
        return;
      }
    }

    // Click on tab row -> focus tab
    const tabRow = target.closest('.tab-row');
    if (tabRow && !target.closest('.tab-actions')) {
      const tabId = Number(tabRow.getAttribute('data-tab-id'));
      const windowId = Number(tabRow.getAttribute('data-window-id'));
      focusTab(tabId, windowId);
      return;
    }
  }

  function handleFavoriteClick(e) {
    const target = e.target;

    // Don't open tab if we just finished a drag
    if (isDragging) {
      isDragging = false;
      return;
    }

    // Remove button
    const removeBtn = target.closest('[data-action="remove-fav"]');
    if (removeBtn) {
      const index = Number(removeBtn.getAttribute('data-index'));
      removeFavorite(index);
      e.stopPropagation();
      return;
    }

    // Click favorite item -> open in current tab
    const favItem = target.closest('.favorite-item');
    if (favItem) {
      const url = favItem.getAttribute('data-url');
      if (url) {
        chrome.tabs.update({ url });
      }
    }
  }

  // ========== Modal ==========
  function showAddFavoriteModal() {
    const overlay = document.getElementById('modal-overlay');
    const urlInput = document.getElementById('fav-url');
    const titleInput = document.getElementById('fav-title');

    if (overlay) overlay.style.display = 'flex';
    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';

    // Focus on URL input
    setTimeout(() => urlInput?.focus(), 100);
  }

  function hideModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function confirmAddFavorite() {
    const url = document.getElementById('fav-url')?.value.trim();
    const title = document.getElementById('fav-title')?.value.trim();

    if (!url) {
      showToast('Please enter a URL');
      return;
    }

    // Basic URL validation
    let validUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      validUrl = 'https://' + url;
    }

    // Auto-extract friendly name from URL if no title provided
    const displayTitle = title || extractSiteNameFromUrl(validUrl);

    await addFavorite(validUrl, displayTitle, '');
    hideModal();
  }

  /**
   * Extract a friendly site name from URL (similar to Google Chrome's new tab shortcuts)
   * e.g. "https://mail.google.com/mail/u/0/" -> "Gmail"
   *      "https://github.com/user/repo" -> "GitHub"
   *      "https://www.youtube.com" -> "YouTube"
   */
  function extractSiteNameFromUrl(url) {
    // Well-known site name mappings
    const SITE_NAMES = {
      'google.com': 'Google',
      'mail.google.com': 'Gmail',
      'drive.google.com': 'Google Drive',
      'docs.google.com': 'Google Docs',
      'sheets.google.com': 'Google Sheets',
      'calendar.google.com': 'Google Calendar',
      'meet.google.com': 'Google Meet',
      'maps.google.com': 'Google Maps',
      'youtube.com': 'YouTube',
      'www.youtube.com': 'YouTube',
      'github.com': 'GitHub',
      'twitter.com': 'Twitter',
      'x.com': 'X',
      'facebook.com': 'Facebook',
      'www.facebook.com': 'Facebook',
      'instagram.com': 'Instagram',
      'www.instagram.com': 'Instagram',
      'linkedin.com': 'LinkedIn',
      'www.linkedin.com': 'LinkedIn',
      'reddit.com': 'Reddit',
      'www.reddit.com': 'Reddit',
      'notion.so': 'Notion',
      'www.notion.so': 'Notion',
      'figma.com': 'Figma',
      'www.figma.com': 'Figma',
      'slack.com': 'Slack',
      'app.slack.com': 'Slack',
      'discord.com': 'Discord',
      'stackoverflow.com': 'Stack Overflow',
      'www.stackoverflow.com': 'Stack Overflow',
      'zhihu.com': 'Zhihu',
      'www.zhihu.com': 'Zhihu',
      'bilibili.com': 'Bilibili',
      'www.bilibili.com': 'Bilibili',
      'weibo.com': 'Weibo',
      'www.weibo.com': 'Weibo',
      'taobao.com': 'Taobao',
      'www.taobao.com': 'Taobao',
      'jd.com': 'JD',
      'www.jd.com': 'JD',
      'baidu.com': 'Baidu',
      'www.baidu.com': 'Baidu',
      'amazon.com': 'Amazon',
      'www.amazon.com': 'Amazon',
      'netflix.com': 'Netflix',
      'www.netflix.com': 'Netflix',
      'spotify.com': 'Spotify',
      'open.spotify.com': 'Spotify',
      'medium.com': 'Medium',
      'wikipedia.org': 'Wikipedia',
      'en.wikipedia.org': 'Wikipedia',
      'zh.wikipedia.org': 'Wikipedia',
    };

    try {
      const u = new URL(url);
      const hostname = u.hostname;

      // Check exact match first
      if (SITE_NAMES[hostname]) {
        return SITE_NAMES[hostname];
      }

      // Check without www prefix
      const noWww = hostname.replace(/^www\./, '');
      if (SITE_NAMES[noWww]) {
        return SITE_NAMES[noWww];
      }

      // Extract a clean name from hostname
      // "docs.example.co.uk" -> "Example"
      // "my-site.com" -> "My Site"
      const parts = noWww.split('.');
      // Remove TLD parts
      let name = parts[0];
      if (parts.length > 2) {
        // Subdomain case: use subdomain as it's more specific (e.g., "mail" from mail.example.com)
        // Unless it's a generic subdomain
        const genericSubdomains = ['www', 'app', 'api', 'web', 'm', 'mobile'];
        if (genericSubdomains.includes(parts[0])) {
          name = parts[1]; // Use main domain
        } else {
          name = parts[0]; // Use subdomain
        }
      } else if (parts.length === 2) {
        name = parts[0];
      }

      // Capitalize and clean up
      return name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    } catch {
      return url;
    }
  }

  // ========== Backup & Restore ==========
  async function loadBackupInfo() {
    try {
      const result = await chrome.storage.local.get('tabBackup');
      const backup = result.tabBackup;
      const infoEl = document.getElementById('backup-info');
      if (!infoEl) return;

      if (backup && backup.timestamp) {
        const date = new Date(backup.timestamp);
        const tabCount = backup.windows.reduce((s, w) => s + w.tabs.length, 0);
        infoEl.textContent = `Last: ${formatBackupDate(date)} · ${tabCount} tabs`;
        infoEl.title = `${backup.windows.length} windows, ${tabCount} tabs`;
      } else {
        infoEl.textContent = 'No backup yet';
      }
    } catch {
      // ignore
    }
  }

  function formatBackupDate(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString();
  }

  async function manualBackup() {
    try {
      // Trigger backup via the same logic as background.js
      const windows = await chrome.windows.getAll({ populate: true });
      let tabGroups = [];
      try {
        tabGroups = await chrome.tabGroups.query({});
      } catch (e) {}

      const groupMap = {};
      tabGroups.forEach(g => {
        groupMap[g.id] = {
          title: g.title || 'Unnamed Group',
          color: g.color || 'grey',
          collapsed: g.collapsed || false
        };
      });

      const backup = {
        timestamp: Date.now(),
        date: new Date().toLocaleString(),
        windows: []
      };

      const INTERNAL = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://'];

      windows.forEach(win => {
        if (win.type !== 'normal') return;
        const winData = { focused: win.focused, tabs: [] };

        win.tabs.forEach(tab => {
          if (!tab.url || INTERNAL.some(p => tab.url.startsWith(p))) return;
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

      await chrome.storage.local.set({ tabBackup: backup });
      await loadBackupInfo();
      showToast(`Backup saved: ${backup.windows.reduce((s, w) => s + w.tabs.length, 0)} tabs`);
    } catch (e) {
      console.error('Manual backup failed:', e);
      showToast('Backup failed');
    }
  }

  async function confirmRestoreBackup() {
    try {
      const result = await chrome.storage.local.get('tabBackup');
      const backup = result.tabBackup;

      if (!backup || !backup.windows || backup.windows.length === 0) {
        showToast('No backup available to restore');
        return;
      }

      const tabCount = backup.windows.reduce((s, w) => s + w.tabs.length, 0);
      const confirmed = confirm(
        `Restore backup from ${backup.date}?\n\n` +
        `This will open ${backup.windows.length} window(s) with ${tabCount} tabs.\n` +
        `Your current tabs will NOT be closed.`
      );

      if (confirmed) {
        await restoreBackup(backup);
      }
    } catch (e) {
      console.error('Restore failed:', e);
      showToast('Restore failed');
    }
  }

  async function restoreBackup(backup) {
    let restoredTabs = 0;

    for (const win of backup.windows) {
      // Create a new window with the first tab
      if (win.tabs.length === 0) continue;

      const firstTab = win.tabs[0];
      const newWindow = await chrome.windows.create({ url: firstTab.url });
      restoredTabs++;

      // Track group assignments: groupTitle -> [tabIds]
      const groupAssignments = {};

      if (firstTab.groupTitle) {
        groupAssignments[firstTab.groupTitle] = {
          color: firstTab.groupColor,
          tabIds: [newWindow.tabs[0].id]
        };
      }

      // Add remaining tabs
      for (let i = 1; i < win.tabs.length; i++) {
        const tabData = win.tabs[i];
        const newTab = await chrome.tabs.create({
          windowId: newWindow.id,
          url: tabData.url,
          pinned: tabData.pinned
        });
        restoredTabs++;

        if (tabData.groupTitle) {
          if (!groupAssignments[tabData.groupTitle]) {
            groupAssignments[tabData.groupTitle] = {
              color: tabData.groupColor,
              tabIds: []
            };
          }
          groupAssignments[tabData.groupTitle].tabIds.push(newTab.id);
        }
      }

      // Recreate tab groups
      for (const [title, data] of Object.entries(groupAssignments)) {
        if (data.tabIds.length > 0) {
          try {
            const groupId = await chrome.tabs.group({ tabIds: data.tabIds });
            await chrome.tabGroups.update(groupId, {
              title: title,
              color: data.color || 'grey'
            });
          } catch (e) {
            console.warn('Failed to create group:', title, e);
          }
        }
      }
    }

    showToast(`Restored: ${restoredTabs} tabs in ${backup.windows.length} window(s)`);
  }

  // ========== Toast ==========
  function showToast(message, duration = 2500) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');

    if (!toast || !msgEl) return;

    msgEl.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // ========== Favicon Error Handler ==========
  const FALLBACK_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#e0e0e0"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="#666">?</text></svg>'
  );

  function setupFaviconErrorHandler() {
    // Use event delegation on document to catch all img errors
    document.addEventListener('error', (e) => {
      const target = e.target;
      if (target.tagName === 'IMG' && (target.classList.contains('tab-favicon') || target.classList.contains('fav-favicon'))) {
        target.src = FALLBACK_FAVICON;
      }
    }, true); // use capture phase to catch errors before they bubble
  }

  // ========== Auto Refresh ==========
  function setupAutoRefresh() {
    // Listen for tab changes and refresh
    if (chrome.tabs) {
      chrome.tabs.onCreated.addListener(debounce(refresh, 500));
      chrome.tabs.onRemoved.addListener(debounce(refresh, 500));
      chrome.tabs.onUpdated.addListener(debounce((tabId, info) => {
        if (info.status === 'complete' || info.title || info.groupId !== undefined) {
          refresh();
        }
      }, 500));
      chrome.tabs.onMoved.addListener(debounce(refresh, 500));
      chrome.tabs.onAttached.addListener(debounce(refresh, 500));
      chrome.tabs.onDetached.addListener(debounce(refresh, 500));
    }

    // Listen for tab group changes
    if (chrome.tabGroups) {
      chrome.tabGroups.onCreated.addListener(debounce(refresh, 500));
      chrome.tabGroups.onRemoved.addListener(debounce(refresh, 500));
      chrome.tabGroups.onUpdated.addListener(debounce(refresh, 500));
    }
  }

  async function refresh() {
    await renderWindowGroups();
    renderStats();
  }

  // ========== Utilities ==========
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

})();
