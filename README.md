# Tab Groups Dashboard

> A Chrome new tab page that organizes your open tabs by **Chrome native tab groups** and windows, with quick-access favorites and one-click window switching.

![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Privacy](https://img.shields.io/badge/privacy-100%25%20local-brightgreen)

[English](#features) | [中文](#功能特性)

---

## Features

### Core

- **Tab Group Organization** — Tabs displayed by Chrome's native tab groups with matching colors and group names
- **Window Cards** — Each browser window shown as a collapsible card (collapsed by default), with group name tags visible in the header
- **One-Click Window Switch** — Jump to any window directly via the `↗` button without expanding the card
- **Quick Tab Navigation** — Click any tab to switch to the corresponding window and activate it

### Favorites

- **Pinned Favorites** — Save your most-visited sites in a Google-style shortcut grid (icon + short label)
- **Smart Name Detection** — Auto-extracts friendly site names (e.g., `mail.google.com` → "Gmail") when no title is provided
- **Drag & Drop Reorder** — Drag favorites to rearrange their order; new position saved automatically
- **Keyboard Shortcut** — Press `Enter` in the add-favorite modal to confirm instantly

### UI & Search

- **Global Search** — Filter tabs by title or URL in real-time (`Ctrl/Cmd + K`)
- **Collapse/Expand** — Toggle group and window visibility; state persists across sessions
- **Dark/Light Theme** — One-click toggle, preference saved locally
- **Badge Counter** — Extension icon shows tab count with color coding (green → amber → red)

### Privacy

- **100% Local** — No servers, no accounts, no tracking. All data stays in `chrome.storage.local`

---

## Screenshots

### Collapsed View (Default)

```
┌────────────────────────────────────────────────────────────────────────┐
│  Good afternoon              Monday, May 5, 2026                  🌙   │
├──────────────────────────────────────────┬─────────────────────────────┤
│                                          │ 🔍 Search tabs... (⌘K)     │
│  📌 Favorites                            │                             │
│   🌐      📧      📝      🎨            │  Overview                   │
│  GitHub  Gmail  Notion  Figma   [+]      │  3 Windows · 7 Groups       │
│                                          │  23 Tabs                    │
│  ▶ 🖥️ Current Window                    │                             │
│    [🔵 Work] [🟢 Learning]  12 tabs [↗] │  Quick Actions              │
│                                          │  [📁 Collapse All]          │
│  ▶ 💻 Window 2                           │  [📂 Expand All]            │
│    [🟡 Social] [🟣 Research]  5 tabs [↗] │                             │
│                                          │                             │
│  ▶ 💻 Window 3                           │                             │
│    [🔴 Urgent]               6 tabs [↗] │                             │
└──────────────────────────────────────────┴─────────────────────────────┘
```

### Expanded View (Click to Expand)

```
┌────────────────────────────────────────────────────────────────────────┐
│  ▼ 🖥️ Current Window  [🔵 Work] [🟢 Learning]        12 tabs  [↗]    │
├────────────────────────────────────────────────────────────────────────┤
│  ┌─ 🔵 Work ─────────────────────────────────────────────────────┐    │
│  │  [favicon] Jira Board                                  ⭐  ✕  │    │
│  │  [favicon] VS Code Web                                 ⭐  ✕  │    │
│  │  [favicon] Stack Overflow                              ⭐  ✕  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│  ┌─ 🟢 Learning ─────────────────────────────────────────────────┐    │
│  │  [favicon] MDN Docs                                    ⭐  ✕  │    │
│  │  [favicon] TypeScript Handbook                         ⭐  ✕  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│  ┌─ ⚫ Ungrouped ────────────────────────────────────────────────┐    │
│  │  [favicon] New Tab                                     ⭐  ✕  │    │
│  └────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/tab-groups-dashboard.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **Load unpacked**

5. Select the `extension/` folder from the cloned repository

6. Open a new tab — you'll see the Tab Groups Dashboard!

---

## Permissions

| Permission | Purpose |
|------------|---------|
| `tabs` | Read open tabs to display them on the dashboard |
| `tabGroups` | Read Chrome tab group names, colors, and collapse state |
| `storage` | Save favorites, collapsed state, and theme preference locally |
| `activeTab` | Navigate to a tab or window when you click on it |

---

## How It Works

1. **Data Fetching** — Queries `chrome.windows.getAll()` and `chrome.tabGroups.query()` to build a 3-level hierarchy: Window → Group → Tabs
2. **Rendering** — Renders collapsible window cards with group tags in the header; windows default to collapsed
3. **Window Jump** — The `↗` button calls `chrome.windows.update(windowId, { focused: true })` to switch windows without expanding
4. **Tab Navigation** — Clicking a tab calls `chrome.windows.update()` + `chrome.tabs.update()` to switch window and activate tab
5. **Favorites** — Stored in `chrome.storage.local`, supports drag-and-drop reorder, auto-detects site names from URLs
6. **Auto-refresh** — Listens to tab/group/window change events for live updates

---

## Tech Stack

- **Vanilla JavaScript** — No frameworks, no build step
- **CSS Custom Properties** — Theming, responsive design, drag-and-drop visuals
- **Chrome Extension Manifest V3** — Modern extension architecture
- **Chrome APIs** — `tabs`, `tabGroups`, `windows`, `storage`
- **Pillow (build only)** — Icon generation at multiple resolutions

---

## Project Structure

```
tab-groups-dashboard/
├── extension/
│   ├── manifest.json       # Extension manifest (Manifest V3)
│   ├── index.html          # New tab page
│   ├── style.css           # Stylesheet (light/dark themes)
│   ├── app.js              # Core application logic
│   ├── background.js       # Service worker (badge counter)
│   └── icons/              # Extension icons (16/48/128px)
├── docs/
│   └── privacy.html        # Privacy policy page
├── PRIVACY.md              # Privacy policy (markdown)
├── LICENSE                 # MIT License
├── README.md               # English documentation
└── README.zh-CN.md         # 中文文档
```

---

## Privacy

This extension runs **100% locally**. No data is collected, transmitted, or shared. See our [Privacy Policy](docs/privacy.html) for full details.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

[MIT](LICENSE) — Use it freely.
